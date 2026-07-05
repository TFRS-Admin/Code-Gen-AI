import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrollIntoView; several chat/log views call it to
// auto-scroll to the latest message.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
