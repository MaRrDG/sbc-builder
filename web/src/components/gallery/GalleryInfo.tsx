// What the Gallery can know: players are recorded from the first club sync with the extension on.
// Opens by itself on the first visit, and again from the list's info button.
import { useEffect, useRef } from 'react';
import { ClockCounterClockwise } from '@phosphor-icons/react';
import { useI18n } from '../../i18n';

export function GalleryInfo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="club-sync gallery-info" aria-labelledby="gallery-info-title" onClose={onClose}>
      <ClockCounterClockwise weight="duotone" className="club-sync-icon" aria-hidden />
      <h2 id="gallery-info-title">{t('gallery.info.title')}</h2>
      <p>{t('gallery.info.p1')}</p>
      <p>{t('gallery.info.p2')}</p>
      <p>{t('gallery.info.p3')}</p>
      <button type="button" className="club-sync-close" autoFocus onClick={onClose}>
        {t('gallery.info.ok')}
      </button>
    </dialog>
  );
}
