// Entry point Remotion looks for. It wires the root component that declares
// every composition. Keep this file tiny — all registration lives in Root.tsx.
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
