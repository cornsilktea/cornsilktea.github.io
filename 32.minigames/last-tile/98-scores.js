"use strict";
class TournamentScores {
    constructor(results) {
        this.totals = new Map();
        this.nicks = new Map();
        Object.keys(results || {}).forEach((round) => {
            const result = results[round];
            const ranks = result.ranks || {};
            Object.keys(ranks).forEach((id) => {
                this.totals.set(id, (this.totals.get(id) || 0) + ScoreTable.pointsFor(ranks[id]));
                this.nicks.set(id, (result.names || {})[id] || this.nicks.get(id) || "?");
            });
        });
    }
    ids() {
        return Array.from(this.totals.keys());
    }
    total(id) {
        return this.totals.get(id) || 0;
    }
    nick(id) {
        return this.nicks.get(id) || "?";
    }
    idsByTotal() {
        return this.ids().sort((a, b) => this.total(b) - this.total(a));
    }
    bestTotal() {
        let best = -1;
        this.totals.forEach((total) => { best = Math.max(best, total); });
        return best;
    }
    topIds() {
        const sorted = this.idsByTotal();
        const top = sorted.length ? this.total(sorted[0]) : 0;
        return sorted.filter((id) => this.total(id) === top);
    }
    winnerIds() {
        const best = this.bestTotal();
        return this.ids().filter((id) => this.total(id) === best);
    }
}
