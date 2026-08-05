declare module 'bootstrap' {
  export class Offcanvas {
    constructor(element: Element, options?: Record<string, unknown>);
    static getInstance(element: Element): Offcanvas | null;
    hide(): void;
    show(): void;
  }
}
