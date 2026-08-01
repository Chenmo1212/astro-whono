import { initAdminDetailsMenus } from './details-menu';

const CLEANUP_KEY = '__astroWhonoAdminContentFilterMenusCleanup';
type WindowWithAdminContentFilterMenus = Window & {
  [CLEANUP_KEY]?: () => void;
};

const initAdminContentFilterMenus = () => {
  const windowWithCleanup = window as WindowWithAdminContentFilterMenus;
  windowWithCleanup[CLEANUP_KEY]?.();

  const cleanupCallbacks = [
    initAdminDetailsMenus({
      selector: '.admin-content-filter-menu'
    }),
    initAdminDetailsMenus({
      selector: '.admin-content-source-error'
    })
  ];

  windowWithCleanup[CLEANUP_KEY] = () => {
    cleanupCallbacks.forEach((cleanup) => cleanup());
  };
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminContentFilterMenus, { once: true });
} else {
  initAdminContentFilterMenus();
}
