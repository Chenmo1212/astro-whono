type AdminDetailsMenuOptions = {
  selector: string;
  documentRoot?: Document;
  exclusive?: boolean;
  closeOnOutsideClick?: boolean;
};

const getOpenDetailsMenus = (
  selector: string,
  documentRoot: Document
): HTMLDetailsElement[] =>
  Array.from(documentRoot.querySelectorAll<HTMLDetailsElement>(`${selector}[open]`));

export const closeAdminDetailsMenus = (
  selector: string,
  except: HTMLDetailsElement | null = null,
  documentRoot: Document = document
): void => {
  getOpenDetailsMenus(selector, documentRoot).forEach((details) => {
    if (details !== except) details.open = false;
  });
};

export const closeClosestAdminDetailsMenu = (
  trigger: HTMLElement,
  selector: string
): void => {
  const details = trigger.closest<HTMLDetailsElement>(selector);
  if (details) details.open = false;
};

export const initAdminDetailsMenus = ({
  selector,
  documentRoot = document,
  exclusive = true,
  closeOnOutsideClick = true
}: AdminDetailsMenuOptions): (() => void) => {
  const handleClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;

    const currentMenu = event.target.closest<HTMLDetailsElement>(selector);
    if (currentMenu) {
      const summary = event.target.closest<HTMLElement>('summary');
      if (exclusive && summary?.parentElement === currentMenu) {
        closeAdminDetailsMenus(selector, currentMenu, documentRoot);
      }
      return;
    }

    if (closeOnOutsideClick) {
      closeAdminDetailsMenus(selector, null, documentRoot);
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    const openMenu = getOpenDetailsMenus(selector, documentRoot).at(-1);
    if (!openMenu) return;

    event.preventDefault();
    openMenu.open = false;
    openMenu.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  };

  documentRoot.addEventListener('click', handleClick);
  documentRoot.addEventListener('keydown', handleKeydown);

  return () => {
    documentRoot.removeEventListener('click', handleClick);
    documentRoot.removeEventListener('keydown', handleKeydown);
  };
};
