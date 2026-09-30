// PostCSS for every stylesheet Vite builds: the accessibility settings' motion and text size (tools/postcss-a11y.mjs).
import a11y from './tools/postcss-a11y.mjs';

export default { plugins: [a11y()] };
