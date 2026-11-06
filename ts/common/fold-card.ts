class FoldCard {
  static readonly SELECTOR = ".st-fold";
  private static readonly READY_FLAG = "foldReady";

  private readonly body: HTMLDivElement;
  private readonly button: HTMLButtonElement;

  private constructor(private readonly card: HTMLElement, header: HTMLElement) {
    this.body = document.createElement("div");
    this.body.className = "st-fold-body";
    while (header.nextSibling) this.body.appendChild(header.nextSibling);
    card.appendChild(this.body);
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "st-fold-btn";
    header.appendChild(this.button);
    header.addEventListener("click", () => this.toggle());
    this.setOpen(card.dataset.open === "1");
  }

  static bindAll(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>(FoldCard.SELECTOR).forEach((card) => {
      const header = card.firstElementChild as HTMLElement | null;
      if (!header || card.dataset[FoldCard.READY_FLAG]) return;
      card.dataset[FoldCard.READY_FLAG] = "1";
      new FoldCard(card, header);
    });
  }

  toggle(): void {
    this.setOpen(!this.card.classList.contains("open"));
  }

  private setOpen(open: boolean): void {
    this.body.hidden = !open;
    this.card.classList.toggle("open", open);
    this.button.setAttribute("aria-expanded", String(open));
    this.button.setAttribute("aria-label", open ? "접기" : "펼치기");
  }
}
