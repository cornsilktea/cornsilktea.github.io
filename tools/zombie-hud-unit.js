// 31번 경기 시간표·지도 위치 공개·명단 순서·닉네임 시야 판정 검사. 사용: node tools/zombie-hud-unit.js
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

class ZombieHudUnit {
  constructor() {
    this.failed = 0;
    this.context = vm.createContext({ Math, JSON });
    const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    this.api = vm.runInContext(read("31.zombie-hud.js") + "\n" + read("31.zombie-missions.js") + "\n;({ ZombieRoundClock, ZombieHumanPing, ZombieRosterOrder, ZombieFloorSlab, ZombieBodySight, ZombieNameTagRule, ZombieMissionSites })", this.context);
  }

  missionRoom() {
    const { ZombieMissionSites: M } = this.api;
    const plans = [{ N: [["stairs", 0, 0], ["class", 1, 1, "1반"], ["library", 2, 3, "도서실"]], S: [["art", 1, 1, "미술실"]] }];
    const sites = M.build(plans, 54, 12, 3, 18);
    const [cls, library, art] = sites;
    this.check("지정된 방 안이면 수행 가능", M.within(cls, cls.x + 1.5, cls.z));
    this.check("벽 너머 옆방은 가까워도 불가", !M.within(library, library.x - 1, library.z));
    this.check("벽 너머 계단실은 가까워도 불가", !M.within(cls, cls.x - 1, cls.z));
    this.check("방 안이어도 먼 곳은 불가", !M.within(cls, cls.x + 5, cls.z));
    this.check("두 칸짜리 방은 범위도 두 칸", library.room.x1 - library.room.x0 === 24);
    this.check("남쪽 방 범위는 복도 남쪽", art.room.z0 === -18 && art.room.z1 === -3 && M.within(art, art.x + 1, art.z));
  }

  check(name, passed) {
    console.log((passed ? "통과  " : "실패  ") + name);
    if (!passed) this.failed++;
  }

  clock() {
    const { ZombieRoundClock: C, ZombieHumanPing: P } = this.api;
    this.check("경기 2분 30초", C.ROUND_MS === 150000);
    this.check("좀비 대기 10초", C.HOLD_MS === 10000);
    this.check("좀비 강화는 마지막 30초 그대로", C.RUSH_MS === 30000);
    this.check("종은 남은 2:00·1:00, 강화 알림과 겹치지 않음", C.BELL_ELAPSED_MS.join() === "30000,90000" && !C.BELL_ELAPSED_MS.includes(C.ROUND_MS - C.RUSH_MS));
    this.check("첫 공개는 풀려난 15초 뒤(경과 25초, 남은 2:05)", P.FIRST_MS === 25000 && !P.activeAt(24999) && P.activeAt(25000) && !P.activeAt(28000));
    this.check("이후 20초마다 3초", P.activeAt(45000) && P.activeAt(47999) && !P.activeAt(48000) && P.activeAt(125000) && !P.activeAt(128000));
    this.check("마지막 10초 직전까지 꺼짐", !P.activeAt(139999));
    let always = true;
    for (let e = 140000; e < 150000; e += 100) always = always && P.activeAt(e);
    this.check("마지막 10초는 계속 공개", always);
    this.check("다음 공개까지 초: 시작 25", P.secondsUntilNext(0) === 25 && P.secondsUntilNext(-3000) === 25);
    this.check("다음 공개까지 초: 경과 130초면 마지막 공개까지 10", P.secondsUntilNext(130000) === 10);
    this.check("다음 공개까지 초: 경과 28초면 17", P.secondsUntilNext(28000) === 17);
    let fades = true;
    for (let e = 25000; e < 150000; e += 100) if (P.activeAt(e)) { const f = P.fadeAt(e); fades = fades && f > 0 && f <= 1; }
    this.check("공개 중 빛 세기는 항상 0~1", fades);
  }

  roster() {
    const { ZombieRosterOrder: O } = this.api;
    const row = (name, role, since) => ({ name, role, since, me: false });
    const names = O.sorted([row("인간1", "human", 0), row("감염2", "zombie", 200), row("숙주", "origin", 0), row("인간2", "human", 0), row("감염1", "zombie", 100)]).map((r) => r.name).join();
    this.check("숙주 → 좀비(감염 순서) → 인간", names === "숙주,감염1,감염2,인간1,인간2");
  }

  sight() {
    const { ZombieBodySight: S, ZombieFloorSlab: F, ZombieNameTagRule: R } = this.api;
    const slab = new F(4, { x0: -54, x1: 54, z0: -18, z1: 18 }, [{ x0: 42, x1: 54, z0: 5, z1: 17.8 }]);
    const count = (boxes, eye, body, screen) => new S(screen || (() => true), () => boxes, slab).visiblePoints(eye, body);
    const eye = { x: 0, y: 1.6, z: 0 }, body = { x: 0, y: 0, z: 6 }, all = S.BODY_POINTS.length;
    const wall = { x0: -5, x1: 5, y0: 0, y1: 4, z0: 3, z1: 3.2 };
    const halfCabinet = { x0: -1, x1: 0.05, y0: 0, y1: 2, z0: 3, z1: 3.5 };
    const desk = { x0: -2, x1: 2, y0: 0, y1: 0.8, z0: 5, z1: 5.6 };
    this.check("가리는 것이 없으면 전부 보임", count([], eye, body) === all && R.shows(false, all));
    this.check("벽 뒤는 하나도 안 보임", count([wall], eye, body) === 0 && !R.shows(false, 0));
    this.check("가까워도 벽 뒤면 표시 안 함", count([wall], eye, { x: 0, y: 0, z: 3.4 }) === 0);
    this.check("캐비닛에 반쯤 가리면 표시 안 함", !R.shows(false, count([halfCabinet], eye, body)));
    this.check("책상이 다리만 가리면 상체가 대부분 보여 표시", count([desk], eye, body) === 5 && R.shows(false, 5));
    this.check("층이 다르면 슬래브에 막힘", count([], { x: 0, y: 1.6, z: 0 }, { x: 2, y: 4, z: 2 }) === 0);
    this.check("계단 구멍으로는 보임", count([], { x: 48, y: 1.6, z: 10 }, { x: 48, y: 4, z: 13 }) >= R.SHOW_POINTS);
    this.check("화면 밖 부위는 세지 않음", count([], eye, body, (spot) => spot.x < 0) === 2);
    const fog = { near: 2, far: 13.6 };
    this.check("안개 절반 안쪽만 새로 표시", R.withinRange(false, 7.8, fog) && !R.withinRange(false, 7.9, fog));
    this.check("표시 중이면 조금 더 멀어져도 유지(깜박임 방지)", R.withinRange(true, 8.9, fog) && !R.withinRange(true, 9.0, fog));
    this.check("부위 수 기준도 깜박임 방지", R.shows(true, 4) && !R.shows(false, 4));
  }

  run() {
    this.clock();
    this.roster();
    this.sight();
    this.missionRoom();
    console.log(this.failed ? "실패 " + this.failed + "건" : "모두 통과");
    process.exit(this.failed ? 1 : 0);
  }
}

new ZombieHudUnit().run();
