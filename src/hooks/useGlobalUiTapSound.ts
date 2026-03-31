import { useEffect } from 'react';
import { tryPlayGlobalUiTapSound } from '../audio/appSounds';

/**
 * Light click sound for most buttons/controls. Skips login card, main nav tabs (they use tab sound),
 * and elements with data-no-ui-sound.
 */
export function useGlobalUiTapSound(): void {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.target;
      if (!(el instanceof Element)) return;

      const interactive = el.closest(
        'button, [type="submit"], [type="button"], [role="button"], .btn, label[for]',
      );
      if (!interactive || !(interactive instanceof HTMLElement)) return;

      if (interactive.closest('.login-page')) return;
      if (interactive.closest('.nav-item')) return;
      if (interactive.closest('[data-no-ui-sound]')) return;
      if (interactive.closest('.toast-stack')) return;
      if (interactive.closest('.modal-overlay, .modal')) return;

      if (interactive instanceof HTMLInputElement) {
        const ty = interactive.type;
        if (ty === 'text' || ty === 'email' || ty === 'password' || ty === 'search' || ty === 'number')
          return;
        if (ty === 'range' || ty === 'file') return;
      }
      if (interactive.closest('textarea')) return;

      tryPlayGlobalUiTapSound();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);
}
