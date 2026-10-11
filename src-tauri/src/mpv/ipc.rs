//! 通过命名管道与 mpv 的 JSON IPC 通信。
//!
//! 两个关键约束，都是踩过坑之后定下来的：
//!
//! 1. mpv 的 IPC 是「一行一个 JSON」，并且会在同一根管道上主动推送事件
//!    （start-file、file-loaded 等）。所以每个请求都带 `request_id`，
//!    只有 request_id 对得上的那一行才是响应，其余全部丢弃。
//!
//! 2. 命名管道句柄是同步的（没有 FILE_FLAG_OVERLAPPED）。在同步句柄上
//!    「挂着阻塞读的同时去写」会互相锁死，写入永远不返回。所以这里用一个
//!    常驻工作线程串行处理「先写后读」，同一时刻只可能有一个操作在管道上。

use std::fmt;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

/// 单次请求的等待上限。
const REQUEST_TIMEOUT: Duration = Duration::from_millis(1500);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IpcError {
  /// 管道已经断开，需要重新连接。
  Disconnected,
  /// mpv 明确拒绝了这个请求，例如属性此刻还不可用。
  Rejected(String),
  /// 超时，没等到响应。
  Timeout,
}

impl fmt::Display for IpcError {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      IpcError::Disconnected => write!(formatter, "与 mpv 的连接已断开"),
      IpcError::Rejected(reason) => write!(formatter, "mpv 拒绝了该操作: {reason}"),
      IpcError::Timeout => write!(formatter, "等待 mpv 响应超时"),
    }
  }
}

struct Job {
  request_id: i64,
  payload: String,
}

type Reply = (i64, Result<Value, IpcError>);

pub struct MpvIpc {
  jobs: Mutex<Sender<Job>>,
  replies: Mutex<Receiver<Reply>>,
  next_request_id: AtomicI64,
}

impl MpvIpc {
  /// 连接到 mpv 创建的命名管道。管道还没建好时会直接返回错误，由调用方重试。
  pub fn connect(pipe_path: &str) -> Result<Self, String> {
    let file = OpenOptions::new()
      .read(true)
      .write(true)
      .open(pipe_path)
      .map_err(|error| format!("连接 mpv IPC 失败: {error}"))?;

    let (job_sender, job_receiver) = channel::<Job>();
    let (reply_sender, reply_receiver) = channel::<Reply>();

    thread::spawn(move || run_worker(file, job_receiver, reply_sender));

    Ok(Self {
      jobs: Mutex::new(job_sender),
      replies: Mutex::new(reply_receiver),
      next_request_id: AtomicI64::new(1),
    })
  }

  /// 发送一条命令并等待它的响应。
  pub fn request(&self, command: Value) -> Result<Value, IpcError> {
    let request_id = self.next_request_id.fetch_add(1, Ordering::SeqCst);
    let payload = json!({ "command": command, "request_id": request_id }).to_string();

    {
      let jobs = self.jobs.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
      jobs.send(Job { request_id, payload }).map_err(|_| IpcError::Disconnected)?;
    }

    let deadline = Instant::now() + REQUEST_TIMEOUT;

    loop {
      let remaining = deadline.saturating_duration_since(Instant::now());

      if remaining.is_zero() {
        return Err(IpcError::Timeout);
      }

      let (reply_id, outcome) = {
        let replies = self.replies.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        replies.recv_timeout(remaining).map_err(|error| match error {
          RecvTimeoutError::Timeout => IpcError::Timeout,
          RecvTimeoutError::Disconnected => IpcError::Disconnected,
        })?
      };

      // 可能是上一次超时被放弃的响应，跳过继续等。
      if reply_id != request_id {
        continue;
      }

      return outcome;
    }
  }

  /// 读取数值属性；属性尚未就绪时返回 `Ok(None)`。
  pub fn get_number(&self, name: &str) -> Result<Option<f64>, IpcError> {
    match self.request(json!(["get_property", name])) {
      Ok(value) => Ok(value.as_f64()),
      Err(IpcError::Rejected(_)) => Ok(None),
      Err(other) => Err(other),
    }
  }

  /// 读取布尔属性；属性尚未就绪时返回 `Ok(None)`。
  pub fn get_bool(&self, name: &str) -> Result<Option<bool>, IpcError> {
    match self.request(json!(["get_property", name])) {
      Ok(value) => Ok(value.as_bool()),
      Err(IpcError::Rejected(_)) => Ok(None),
      Err(other) => Err(other),
    }
  }

  /// 写入数值属性。
  pub fn set_number(&self, name: &str, value: f64) -> Result<(), IpcError> {
    self.request(json!(["set_property", name, value])).map(|_| ())
  }

  /// 写入布尔属性。
  pub fn set_flag(&self, name: &str, value: bool) -> Result<(), IpcError> {
    self.request(json!(["set_property", name, value])).map(|_| ())
  }

  pub fn seek_absolute(&self, seconds: f64) -> Result<(), IpcError> {
    self.request(json!(["seek", seconds, "absolute"])).map(|_| ())
  }

  /// 相对当前位置前后跳转，秒数为正表示前进。
  pub fn seek_relative(&self, offset: f64) -> Result<(), IpcError> {
    self.request(json!(["seek", offset, "relative"])).map(|_| ())
  }

  /// 精确跳转（关键帧之间也定位），用于抓取指定时间点的画面。
  pub fn seek_exact(&self, seconds: f64) -> Result<(), IpcError> {
    self.request(json!(["seek", seconds, "absolute+exact"])).map(|_| ())
  }
}

/// 独占管道句柄，串行地「写入请求 → 读到匹配响应」。
fn run_worker(file: File, jobs: Receiver<Job>, replies: Sender<Reply>) {
  let mut stream = BufReader::new(file);
  let mut line = String::new();

  while let Ok(job) = jobs.recv() {
    let write_result = stream
      .get_mut()
      .write_all(job.payload.as_bytes())
      .and_then(|()| stream.get_mut().write_all(b"\n"))
      .and_then(|()| stream.get_mut().flush());

    if write_result.is_err() {
      let _ = replies.send((job.request_id, Err(IpcError::Disconnected)));
      return;
    }

    loop {
      line.clear();

      match stream.read_line(&mut line) {
        Ok(0) | Err(_) => {
          let _ = replies.send((job.request_id, Err(IpcError::Disconnected)));
          return;
        }
        Ok(_) => {
          let Ok(message) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
          };

          // 事件推送没有 request_id，当它不存在。
          if message.get("request_id").and_then(Value::as_i64) != Some(job.request_id) {
            continue;
          }

          let outcome = match message.get("error").and_then(Value::as_str) {
            Some(error) if error != "success" => Err(IpcError::Rejected(error.to_string())),
            _ => Ok(message.get("data").cloned().unwrap_or(Value::Null)),
          };

          let _ = replies.send((job.request_id, outcome));
          break;
        }
      }
    }
  }
}
