/** Visual distinction: schedule template vs daily vs regular items. */
export function ItemOriginBadges({
  daily,
  fromTemplate,
}: {
  daily?: boolean;
  fromTemplate?: boolean;
}) {
  return (
    <span className="item-origin-badges">
      {fromTemplate && <span className="badge badge-template">template</span>}
      {daily && <span className="badge badge-daily">daily</span>}
      {!daily && !fromTemplate && <span className="badge badge-regular">regular</span>}
    </span>
  );
}
