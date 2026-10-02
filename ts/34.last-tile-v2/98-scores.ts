interface RoundResult {
  ranks?: Record<string, number>;
  names?: Record<string, string>;
}

type ResultsRecord = Record<string, RoundResult>;

class TournamentScores {
  private readonly totals = new Map<string, number>();
  private readonly nicks = new Map<string, string>();

  constructor(results: ResultsRecord | null) {
    Object.keys(results || {}).forEach((round) => {
      const result = (results as ResultsRecord)[round];
      const ranks = result.ranks || {};
      Object.keys(ranks).forEach((id) => {
        this.totals.set(id, (this.totals.get(id) || 0) + ScoreTable.pointsFor(ranks[id]));
        this.nicks.set(id, (result.names || {})[id] || this.nicks.get(id) || "?");
      });
    });
  }

  ids(): string[] {
    return Array.from(this.totals.keys());
  }

  total(id: string): number {
    return this.totals.get(id) || 0;
  }

  nick(id: string): string {
    return this.nicks.get(id) || "?";
  }

  idsByTotal(): string[] {
    return this.ids().sort((a, b) => this.total(b) - this.total(a));
  }

  bestTotal(): number {
    let best = -1;
    this.totals.forEach((total) => { best = Math.max(best, total); });
    return best;
  }

  topIds(): string[] {
    const sorted = this.idsByTotal();
    const top = sorted.length ? this.total(sorted[0]) : 0;
    return sorted.filter((id) => this.total(id) === top);
  }

  winnerIds(): string[] {
    const best = this.bestTotal();
    return this.ids().filter((id) => this.total(id) === best);
  }
}
