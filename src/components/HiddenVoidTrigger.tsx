export function HiddenVoidTrigger() {
  return (
    <button
      type="button"
      className="void-hit"
      tabIndex={-1}
      aria-hidden
      data-no-ui-sound
      onClick={() => {
        window.history.pushState(null, '', '/void');
        window.dispatchEvent(new Event('notetasks-nav'));
      }}
    />
  );
}
