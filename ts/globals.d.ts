interface RecordSlot {
  rec: unknown;
  loaded: boolean;
  text(): string;
  who(): string;
}

interface WorldRecordHandle extends RecordSlot {
  cls?: RecordSlot;
  onChange(listener: () => void): void;
  load(): void;
  prompt(value: number): void;
}

interface Window {
  WorldRecord?: (game: string, options: { lower: boolean; format: (ms: number) => string }) => WorldRecordHandle;
}
