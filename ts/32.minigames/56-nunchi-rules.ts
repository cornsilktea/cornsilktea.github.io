class NunchiRules {
  static readonly ROUNDS = 6;
  static readonly CARD_COUNT = 6;
  static readonly PICK_MS = 10000;
  static readonly COMMIT_GRACE_MS = 700;
  static readonly REVEAL_DELAY_MS = 1000;
  static readonly RESOLVE_DELAY_MS = 2300;
  static readonly SHOW_MS = 3200;
  static readonly ROUND_MS = NunchiRules.PICK_MS + NunchiRules.RESOLVE_DELAY_MS + NunchiRules.SHOW_MS;
  static readonly OVER_FALLBACK_MS = 8000;
  static readonly AI_PLACE_MIN_MS = 1500;
  static readonly AI_PLACE_SPAN_MS = 7000;
  static readonly AI_MARK = "ai";
  static readonly SEAT_COUNT = 6;
  static readonly PRIZE_POOL: readonly number[] = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  static readonly STAR_CHANCE = 0.3;
  static readonly STAR_BONUS = 2;
}

class NunchiSeeds {
  private static readonly FNV_PRIME = 16777619;
  private static readonly ROUND_MIX = 7919;

  static mix(seed: number, round: number, id: string): number {
    let mixed = seed ^ (round * NunchiSeeds.ROUND_MIX);
    for (let index = 0; index < id.length; index++) mixed = Math.imul(mixed ^ id.charCodeAt(index), NunchiSeeds.FNV_PRIME);
    return mixed;
  }
}

class NunchiPrizeCard {
  constructor(readonly points: number, readonly star: boolean) {}

  value(): number {
    return this.points + (this.star ? NunchiRules.STAR_BONUS : 0);
  }
}

class NunchiDeck {
  private static readonly SEED_MIX = 0x2F6B1D;

  private readonly cards: NunchiPrizeCard[];

  constructor(seed: number) {
    const random = new SeededRandom(seed ^ NunchiDeck.SEED_MIX);
    const pool = NunchiRules.PRIZE_POOL.slice();
    for (let index = pool.length - 1; index > 0; index--) {
      const other = Math.floor(random.next() * (index + 1));
      const kept = pool[index];
      pool[index] = pool[other];
      pool[other] = kept;
    }
    this.cards = pool.slice(0, NunchiRules.ROUNDS).map((points) => new NunchiPrizeCard(points, random.next() < NunchiRules.STAR_CHANCE));
  }

  cardFor(round: number): NunchiPrizeCard {
    return this.cards[round];
  }
}

class NunchiHand {
  private readonly cards = new Set<number>();

  constructor() {
    for (let card = 1; card <= NunchiRules.CARD_COUNT; card++) this.cards.add(card);
  }

  has(card: number): boolean {
    return this.cards.has(card);
  }

  remaining(): number[] {
    return Array.from(this.cards).sort((a, b) => a - b);
  }

  play(card: number): void {
    this.cards.delete(card);
  }
}

class NunchiAutoPick {
  static card(seed: number, round: number, id: string, remaining: readonly number[]): number {
    if (remaining.length === 0) return 0;
    const random = new SeededRandom(NunchiSeeds.mix(seed, round, id));
    return remaining[Math.min(remaining.length - 1, Math.floor(random.next() * remaining.length))];
  }
}

interface NunchiPlay {
  readonly id: string;
  readonly card: number;
  readonly clashed: boolean;
}

interface NunchiRoundOutcome {
  readonly round: number;
  readonly prize: NunchiPrizeCard;
  readonly carryIn: number;
  readonly plays: readonly NunchiPlay[];
  readonly winnerId: string;
  readonly awarded: number;
  readonly carryOut: number;
}

class NunchiRoundJudge {
  judge(round: number, prize: NunchiPrizeCard, carryIn: number, picks: ReadonlyMap<string, number>): NunchiRoundOutcome {
    const counts = new Map<number, number>();
    picks.forEach((card) => counts.set(card, (counts.get(card) || 0) + 1));
    const plays: NunchiPlay[] = [];
    picks.forEach((card, id) => plays.push({ id, card, clashed: (counts.get(card) || 0) > 1 }));
    const winner = plays
      .filter((play) => !play.clashed)
      .reduce<NunchiPlay | null>((best, play) => (!best || play.card > best.card ? play : best), null);
    const pot = prize.value() + carryIn;
    const winnerId = winner ? winner.id : "";
    return { round, prize, carryIn, plays, winnerId, awarded: winnerId ? pot : 0, carryOut: winnerId ? 0 : pot };
  }
}

class NunchiMatchState {
  private readonly deck: NunchiDeck;
  private readonly judge = new NunchiRoundJudge();
  private readonly hands = new Map<string, NunchiHand>();
  private readonly scores = new Map<string, number>();
  private readonly outcomes: NunchiRoundOutcome[] = [];
  private carry = 0;

  constructor(private readonly seed: number, private readonly ids: readonly string[]) {
    this.deck = new NunchiDeck(seed);
    ids.forEach((id) => {
      this.hands.set(id, new NunchiHand());
      this.scores.set(id, 0);
    });
  }

  nextRound(): number {
    return this.outcomes.length;
  }

  isComplete(): boolean {
    return this.outcomes.length >= NunchiRules.ROUNDS;
  }

  prizeFor(round: number): NunchiPrizeCard {
    return this.deck.cardFor(Math.min(round, NunchiRules.ROUNDS - 1));
  }

  carryIn(): number {
    return this.carry;
  }

  hand(id: string): NunchiHand {
    return this.hands.get(id) || new NunchiHand();
  }

  score(id: string): number {
    return this.scores.get(id) || 0;
  }

  outcomeOf(round: number): NunchiRoundOutcome | null {
    return this.outcomes[round] || null;
  }

  apply(round: number, offered: ReadonlyMap<string, number>): NunchiRoundOutcome | null {
    if (round !== this.outcomes.length || round >= NunchiRules.ROUNDS) return null;
    const picks = new Map<string, number>();
    this.ids.forEach((id) => {
      const hand = this.hand(id);
      const wanted = offered.get(id);
      const card = wanted !== undefined && hand.has(wanted) ? wanted : NunchiAutoPick.card(this.seed, round, id, hand.remaining());
      picks.set(id, card);
      hand.play(card);
    });
    const outcome = this.judge.judge(round, this.deck.cardFor(round), this.carry, picks);
    this.outcomes.push(outcome);
    this.carry = outcome.carryOut;
    if (outcome.winnerId) this.scores.set(outcome.winnerId, this.score(outcome.winnerId) + outcome.awarded);
    return outcome;
  }
}

class NunchiStandings {
  static ranking(ids: readonly string[], scoreOf: (id: string) => number): RankEntry[] {
    return ids.map((id) => ({ id, rank: 1 + ids.filter((other) => scoreOf(other) > scoreOf(id)).length }));
  }

  static ordered<T>(items: readonly T[], idOf: (item: T) => string, scoreOf: (id: string) => number): T[] {
    return items.slice().sort((a, b) => scoreOf(idOf(b)) - scoreOf(idOf(a)));
  }
}

class NunchiSha256Constants {
  static readonly ROUND: readonly number[] = NunchiSha256Constants.fractions(64, 3);
  static readonly INITIAL: readonly number[] = NunchiSha256Constants.fractions(8, 2);

  private static fractions(count: number, root: number): number[] {
    const values: number[] = [];
    for (let candidate = 2; values.length < count; candidate++) {
      if (!NunchiSha256Constants.isPrime(candidate)) continue;
      const exact = root === 2 ? Math.sqrt(candidate) : Math.cbrt(candidate);
      values.push(Math.floor((exact - Math.floor(exact)) * 4294967296) >>> 0);
    }
    return values;
  }

  private static isPrime(value: number): boolean {
    for (let divisor = 2; divisor * divisor <= value; divisor++) {
      if (value % divisor === 0) return false;
    }
    return true;
  }
}

class NunchiSha256 {
  private static readonly BLOCK_BYTES = 64;
  private static readonly LENGTH_BYTES = 8;

  static hex(text: string): string {
    const bytes = new TextEncoder().encode(text);
    const paddedLength = (((bytes.length + NunchiSha256.LENGTH_BYTES) >> 6) + 1) << 6;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 4, (bytes.length * 8) >>> 0);
    const hash = NunchiSha256Constants.INITIAL.slice();
    for (let offset = 0; offset < paddedLength; offset += NunchiSha256.BLOCK_BYTES) NunchiSha256.compress(hash, view, offset);
    return hash.map((word) => ("00000000" + (word >>> 0).toString(16)).slice(-8)).join("");
  }

  private static rotate(value: number, bits: number): number {
    return (value >>> bits) | (value << (32 - bits));
  }

  private static compress(hash: number[], view: DataView, offset: number): void {
    const words: number[] = [];
    for (let index = 0; index < 16; index++) words.push(view.getUint32(offset + index * 4));
    for (let index = 16; index < 64; index++) {
      const early = words[index - 15], late = words[index - 2];
      const small0 = NunchiSha256.rotate(early, 7) ^ NunchiSha256.rotate(early, 18) ^ (early >>> 3);
      const small1 = NunchiSha256.rotate(late, 17) ^ NunchiSha256.rotate(late, 19) ^ (late >>> 10);
      words.push((words[index - 16] + small0 + words[index - 7] + small1) >>> 0);
    }
    const state = hash.slice();
    for (let index = 0; index < 64; index++) {
      const [a, b, c, d, e, f, g, h] = state;
      const big1 = NunchiSha256.rotate(e, 6) ^ NunchiSha256.rotate(e, 11) ^ NunchiSha256.rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const first = (h + big1 + choose + NunchiSha256Constants.ROUND[index] + words[index]) >>> 0;
      const big0 = NunchiSha256.rotate(a, 2) ^ NunchiSha256.rotate(a, 13) ^ NunchiSha256.rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (big0 + majority) >>> 0;
      state.splice(0, 8, (first + second) >>> 0, a, b, c, (d + first) >>> 0, e, f, g);
    }
    for (let index = 0; index < 8; index++) hash[index] = (hash[index] + state[index]) >>> 0;
  }
}

class NunchiCommitment {
  private static readonly HEX_LENGTH = 32;

  static digest(seed: number, round: number, id: string, card: number, salt: string): string {
    return NunchiSha256.hex([seed, round, id, card, salt].join("|")).slice(0, NunchiCommitment.HEX_LENGTH);
  }
}
