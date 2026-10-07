interface RecordSlot {
  rec: unknown;
  loaded: boolean;
  text(): string;
  who(): string;
}

interface WorldRecordNameAsk { value: number; seconds: number; fallback: string; needClass: boolean; title?: string }
interface WorldRecordNameAnswer { name: string; grade: number; cls: number }
interface WorldRecordParty { party: string[]; grade: number; cls: number }

interface WorldRecordHandle extends RecordSlot {
  cls?: RecordSlot | null;
  klass?: PortalClass | null;
  noRecord?: boolean;
  onChange(listener: () => void): void;
  load(): Promise<unknown> | void;
  prompt(value: number): void;
  beats(value: number): boolean;
  beatsClass(value: number): boolean;
  askName?(options: WorldRecordNameAsk): Promise<WorldRecordNameAnswer>;
  submitParty?(value: number, party: WorldRecordParty): Promise<unknown>;
}

interface Window {
  WorldRecord?: (game: string, options: { lower: boolean; format: (ms: number) => string }) => WorldRecordHandle;
}

type ThreeModule = typeof import("three");
type SkeletonUtilsModule = typeof import("three/addons/utils/SkeletonUtils.js");
type GLTFLoaderClass = typeof import("three/addons/loaders/GLTFLoader.js").GLTFLoader;
type Three<K extends keyof ThreeModule> = ThreeModule[K] extends abstract new (...args: never[]) => infer Instance ? Instance : never;

interface ThreeLibs {
  THREE: ThreeModule;
  GLTFLoader: GLTFLoaderClass;
  SkeletonUtils: SkeletonUtilsModule;
}

type FirebaseEvent = "value" | "child_added" | "child_changed" | "child_removed";

interface FirebaseSnapshot {
  key: string;
  val<T = unknown>(): T | null;
  exists(): boolean;
}

interface FirebaseTransactionResult {
  committed: boolean;
  snapshot: FirebaseSnapshot;
}

interface FirebaseDisconnectHandle {
  remove(): Promise<void>;
  cancel(): Promise<void>;
}

interface FirebaseRef {
  child(path: string): FirebaseRef;
  set(value: unknown): Promise<void>;
  update(values: Record<string, unknown>): Promise<void>;
  remove(): Promise<void>;
  push(value: unknown): Promise<unknown>;
  once(event: "value"): Promise<FirebaseSnapshot>;
  on(event: FirebaseEvent, listener: (snapshot: FirebaseSnapshot) => void): (snapshot: FirebaseSnapshot) => void;
  off(event: FirebaseEvent, listener: (snapshot: FirebaseSnapshot) => void): void;
  transaction(update: (current: unknown) => unknown): Promise<FirebaseTransactionResult>;
  onDisconnect(): FirebaseDisconnectHandle;
}

interface FirebaseDatabase {
  ref(path: string): FirebaseRef;
}

interface PortalConfig {
  DB_URL: string;
  API_KEY: string;
  AUTH_DOMAIN: string;
  isReady(): boolean;
}

interface PortalClass {
  id: string;
  grade: number;
  cls: number;
  label: string;
}

interface Window {
  PORTAL_CONFIG?: PortalConfig;
  PORTAL_CLASS?: PortalClass | null;
  firebase?: {
    initializeApp(config: { apiKey: string; authDomain: string; databaseURL: string }): unknown;
    database(): FirebaseDatabase;
  };
}

type TileGeometry = import("three").BufferGeometry<import("three").NormalBufferAttributes>;

interface QualityGovernorOptions {
  steps: Array<() => boolean>;
  storageKey?: string;
  isPlaying?: () => boolean;
  slowSec: number;
  slowLimit: number;
}

interface QualityGovernorHandle {
  update(frameSec: number): void;
  lower(): boolean;
  restore(minimumSteps?: number): void;
  readonly stepsTaken: number;
}

interface Window {
  QualityGovernor?: (options: QualityGovernorOptions) => QualityGovernorHandle;
}
