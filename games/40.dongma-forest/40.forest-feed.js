"use strict";
class FrGainRow {
    constructor(id, onExpire) {
        this.id = id;
        this.onExpire = onExpire;
        this.total = 0;
        this.timer = 0;
        const grade = FrItemNames.grade(id);
        this.node = FrDom.make("div", "fr-gain fr-gain-" + grade);
        this.node.style.setProperty("--gain-color", FrItemNames.GRADE_COLORS[grade]);
        this.node.appendChild(FrIcons.image(id, 34));
        this.node.appendChild(FrDom.make("span", "fr-gain-name", FrItemNames.label(id)));
        this.countNode = FrDom.make("span", "fr-gain-count");
        this.node.appendChild(this.countNode);
    }
    add(amount) {
        this.total += amount;
        this.countNode.textContent = "+" + this.total;
        this.node.classList.remove("bump");
        void this.node.offsetWidth;
        this.node.classList.add("bump");
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.fadeOut(), FrGainFeed.SHOW_MS);
    }
    fadeOut() {
        this.node.classList.add("leaving");
        window.setTimeout(() => this.onExpire(this), FrGainFeed.LEAVE_MS);
    }
}
class FrGainFeed {
    constructor(box) {
        this.box = box;
        this.rows = [];
    }
    push(id, amount) {
        if (amount <= 0)
            return;
        const existing = this.rows.find((r) => r.id === id);
        if (existing) {
            existing.add(amount);
            return;
        }
        if (this.rows.length >= FrGainFeed.MAX_ROWS)
            this.drop(this.rows[0]);
        const row = new FrGainRow(id, (expired) => this.drop(expired));
        this.rows.push(row);
        this.box.appendChild(row.node);
        row.add(amount);
    }
    drop(row) {
        const index = this.rows.indexOf(row);
        if (index < 0)
            return;
        this.rows.splice(index, 1);
        if (row.node.parentNode)
            row.node.parentNode.removeChild(row.node);
    }
}
FrGainFeed.SHOW_MS = 2400;
FrGainFeed.LEAVE_MS = 400;
FrGainFeed.MAX_ROWS = 6;
