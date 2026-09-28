// lib/site.css を作るための Tailwind の設定。index.html を直したら作り直す:
//   npx -y tailwindcss@3 -c tailwind.config.cjs -i lib/tailwind-input.css -o lib/site.css --minify
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        primary: '#e94560',
        surface: '#16213e',
        deep: '#0f3460',
        bg: '#1a1a2e',
      },
    },
  },
};
