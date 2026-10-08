// The mystery card slot: card back → silhouette (after 3 misses) → the real card at the end.
// Before the end nothing here may know the answer: the silhouette carries only rating, position and rarity.
import type { DailyAnswer, DailySilhouette, Meta, Player } from '../api';
import { Card, cardArt } from '../components/Card';
import { useI18n } from '../i18n';
import { Silhouette } from './Silhouette';

/** The revealed answer as a Card player (gold tier; Card only reads these fields). */
export const toCardPlayer = (a: DailyAnswer): Player => ({
  id: a.id, assetId: a.id, resourceId: a.id, name: a.name, fullName: a.fullName, rating: a.rating, rareflag: a.rareflag, tier: 3,
  preferredPosition: a.position, possiblePositions: [a.position], club: a.club, league: a.league, nation: a.nation,
  untradeable: true, state: 'free', isLoan: false, rarityName: '', attributes: [], skillMoves: 0, weakFoot: 0, foot: 'Right',
});

function CardBack() {
  return (
    <div className="dg-back" aria-hidden="true">
      <span>?</span>
    </div>
  );
}

function SilhouetteCard({ s, meta }: { s: DailySilhouette; meta: Meta | null }) {
  // only the rarity background and its text colour; the portrait URL is never built into the page
  const art = meta
    ? cardArt(toCardPlayer({ id: 0, name: '', fullName: '', nation: 0, league: 0, club: 0, position: s.position, rating: s.rating, rareflag: s.rareflag, cardType: s.cardType }), meta)
    : null;
  return (
    <div className="card dg-sil" style={art ? { color: art.text } : undefined} aria-hidden="true">
      {art?.bg && <img className="card-bg" src={art.bg} alt="" decoding="async" />}
      <div className="card-rating">{s.rating}</div>
      <div className="card-pos">{s.position}</div>
      <Silhouette className="dg-sil-face" />
    </div>
  );
}

interface Props {
  meta: Meta | null;
  silhouette?: DailySilhouette;
  answer?: DailyAnswer;
  won: boolean;
  /** the game just ended in this visit: play the reveal (otherwise show the end state at once) */
  reveal: boolean;
}

export function MysteryCard({ meta, silhouette, answer, won, reveal }: Props) {
  const { t } = useI18n();
  const label = answer
    ? `${answer.name}, ${answer.rating} ${answer.position}`
    : silhouette
      ? `${t('daily.mystery')}, ${silhouette.rating} ${silhouette.position}`
      : t('daily.mystery');

  let body;
  if (answer && meta) {
    const card = <Card player={toCardPlayer(answer)} meta={meta} eager />;
    if (!reveal) body = card;
    // won: the silhouette lights up into the card, with a gold sheen
    else if (won) body = <div className="dg-win">{card}</div>;
    // lost: the card turns over
    else
      body = (
        <div className="dg-flip">
          <div className="dg-face dg-face-front">{card}</div>
          <div className="dg-face dg-face-back">{silhouette ? <SilhouetteCard s={silhouette} meta={meta} /> : <CardBack />}</div>
        </div>
      );
  } else if (silhouette) body = <div className="dg-rise"><SilhouetteCard s={silhouette} meta={meta} /></div>;
  else body = <CardBack />;

  return (
    <figure className="dg-mystery">
      <div className="dg-mystery-card" role="img" aria-label={label}>
        {body}
      </div>
      {!answer && !silhouette && <figcaption className="dg-mystery-hint">{t('daily.mysteryHint')}</figcaption>}
    </figure>
  );
}
