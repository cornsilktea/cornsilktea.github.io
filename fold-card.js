"use strict";
class FoldCard {
    constructor(card, header) {
        this.card = card;
        this.body = document.createElement("div");
        this.body.className = "st-fold-body";
        while (header.nextSibling)
            this.body.appendChild(header.nextSibling);
        card.appendChild(this.body);
        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.className = "st-fold-btn";
        header.appendChild(this.button);
        header.addEventListener("click", () => this.toggle());
        this.setOpen(card.dataset.open === "1");
    }
    static bindAll(root) {
        root.querySelectorAll(FoldCard.SELECTOR).forEach((card) => {
            const header = card.firstElementChild;
            if (!header || card.dataset[FoldCard.READY_FLAG])
                return;
            card.dataset[FoldCard.READY_FLAG] = "1";
            new FoldCard(card, header);
        });
    }
    toggle() {
        this.setOpen(!this.card.classList.contains("open"));
    }
    setOpen(open) {
        this.body.hidden = !open;
        this.card.classList.toggle("open", open);
        this.button.setAttribute("aria-expanded", String(open));
        this.button.setAttribute("aria-label", open ? "접기" : "펼치기");
    }
}
FoldCard.SELECTOR = ".st-fold";
FoldCard.READY_FLAG = "foldReady";
