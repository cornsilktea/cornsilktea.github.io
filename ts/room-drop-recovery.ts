/* 방 게임 공용: 연결이 잠깐 끊겨 서버가 내 자리를 지웠을 때 방이 남아 있으면 같은 자리를 다시 써 넣는다.
   끊김 자동 삭제(onDisconnect)는 한 번 터지면 사라지므로 다시 연결될 때마다 새로 건다. 30번 RoomSession.rejoinAfterDrop 과 같은 규칙. */

interface RoomDropHost {
  myId(): string;
  room(): FirebaseRef | null;
  leaving(): boolean;
  exit(message: string): void;
  subscribe(ref: FirebaseRef, event: FirebaseEvent, listener: (snapshot: FirebaseSnapshot) => void): void;
  returnRecord(saved: Record<string, unknown>, roomStatus: string): Record<string, unknown> | null;
  afterReturn(): void;
}

class RoomDropRecovery {
  static readonly TRIES = 3;
  static readonly RETRY_MS = 1000;
  static readonly CLOSED_MESSAGE = "방이 종료되었어요.";
  static readonly LOST_MESSAGE = "연결이 끊겨 방에서 나왔어요.";

  constructor(private readonly host: RoomDropHost, private readonly db: FirebaseDatabase, private readonly mineFolders: string[]) {}

  arm(ref: FirebaseRef): void {
    const myId = this.host.myId();
    this.mineFolders.forEach((folder) => ref.child(folder + "/" + myId).onDisconnect().remove());
  }

  disarm(ref: FirebaseRef): void {
    const myId = this.host.myId();
    try {
      this.mineFolders.forEach((folder) => ref.child(folder + "/" + myId).onDisconnect().cancel());
    } catch (error) {
      return;
    }
  }

  watchConnection(ref: FirebaseRef): void {
    this.host.subscribe(this.db.ref(".info/connected"), "value", (snapshot) => {
      if (snapshot.val<boolean>() === true && this.host.room() === ref && !this.host.leaving()) this.arm(ref);
    });
  }

  recover(saved: Record<string, unknown> | null, tries: number = 0): void {
    const ref = this.host.room();
    if (!ref || this.host.leaving()) return;
    if (!saved || tries >= RoomDropRecovery.TRIES) {
      this.host.exit(RoomDropRecovery.LOST_MESSAGE);
      return;
    }
    ref.child("status").once("value").then((statusSnapshot) => {
      if (this.host.room() !== ref || this.host.leaving()) return undefined;
      const status = statusSnapshot.val<string>();
      if (status === null) {
        this.host.exit(RoomDropRecovery.CLOSED_MESSAGE);
        return undefined;
      }
      const record = this.host.returnRecord(saved, status);
      if (!record) {
        this.host.exit(RoomDropRecovery.LOST_MESSAGE);
        return undefined;
      }
      return ref.child("players/" + this.host.myId()).set(record).then(() => {
        if (this.host.room() !== ref || this.host.leaving()) return;
        this.arm(ref);
        this.host.afterReturn();
      });
    }).catch(() => {
      if (this.host.room() === ref && !this.host.leaving()) setTimeout(() => this.recover(saved, tries + 1), RoomDropRecovery.RETRY_MS);
    });
  }
}
