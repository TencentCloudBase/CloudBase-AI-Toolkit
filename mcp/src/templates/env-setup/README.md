# Environment Setup Page Template

This directory contains the modular template system for the CloudBase environment setup page.

## 📁 File Structure

```
env-setup/
├── index.ts          # Main render function (exports renderEnvSetupPage)
├── components.ts     # Reusable UI components
├── styles.ts         # CSS styles
├── scripts.ts        # JavaScript logic  
└── html.ts           # HTML page structure
```

## 🚀 Usage

```typescript
import { renderEnvSetupPage } from './templates/env-setup/index.js';

const html = renderEnvSetupPage({
  envs: [{ EnvId: 'env-xxx', Alias: 'My Env' }],
  accountInfo: { uin: '100010952056' },
  errorContext: null,
  sessionId: 'session-xxx',
  wsPort: 3000
});
```

## 📦 Components

### `components.ts`

Exports reusable UI component render functions:

- `renderHeader(accountInfo?)` - Page header with logo and account info
- `renderSearchBox()` - Search input with filter functionality
- `renderEnvItem(env, index)` - Environment card item
- `renderEmptyState(hasInitError)` - Empty state message
- `renderNoResultsState()` - No search results message
- `renderHelpLinks()` - Help documentation and video links
- `renderActionButtons(hasEnvs, hasInitError)` - Confirm/Cancel/Create buttons
- `renderLoadingState()` - Loading spinner
- `renderSuccessState()` - Success confirmation
- `renderErrorBanner(errorContext, sessionId?)` - Error messages

### `styles.ts`

Exports `CSS_STYLES` constant containing all page styles:

- Modern dark theme with cyan accents
- JetBrains Mono monospace font
- Smooth animations and transitions
- Responsive design (max-width: 520px)
- Glass morphism effects

### `scripts.ts`

Exports `getJavaScripts(wsPort)` function with client-side logic:

- Environment selection handling
- Search and filter functionality
- WebSocket communication
- Loading and success states
- Error handling

### `html.ts`

Exports `buildHTMLPage(css, body, scripts)` function:

- Assembles complete HTML document
- Injects CSS and JavaScript
- Sets page metadata

### `index.ts`

Main entry point, exports:

- `EnvSetupOptions` interface
- `renderEnvSetupPage(options)` function

## 🎨 Features

### Search Functionality
- Real-time filtering by environment name or ID
- Clear button (shows/hides dynamically)
- No results message
- Auto-focus on page load

### Environment Cards
- **Alias displayed prominently** (large, bold)
- Environment ID shown below (small, gray)
- Smooth hover effects
- Selected state with glow effect

### Account Info
- Displayed in top-right corner
- Compact design with icon
- Switch account button

### Help Links
- Documentation link
- Video tutorials link  
- SVG icons with hover effects

### Create Environment
- Always visible at bottom (unless init error)
- Dashed border style
- Large, easy to click

## 🔧 Customization

### Modify Styles

Edit `styles.ts` and update CSS variables:

```typescript
export const CSS_STYLES = `
<style>
  :root {
    --primary-color: #1a1a1a;
    --accent-color: #67E9E9;  // Change accent color
    // ...
  }
</style>
`;
```

### Add New Component

1. Add render function to `components.ts`:

```typescript
export function renderNewComponent(data: any) {
  return `
    <div class="new-component">
      ${data.title}
    </div>
  `.trim();
}
```

2. Import and use in `index.ts`:

```typescript
import { renderNewComponent } from './components.js';

export function renderEnvSetupPage(options: EnvSetupOptions): string {
  // ...
  const bodyHTML = `
    ${renderHeader(accountInfo)}
    ${renderNewComponent({ title: 'Hello' })}
  `;
  // ...
}
```

### Add New JavaScript Function

Edit `scripts.ts`:

```typescript
export function getJavaScripts(wsPort: number): string {
  return `
<script>
  // Add new function
  function myNewFunction() {
    console.log('Hello!');
  }
  
  // ... existing functions
</script>
  `.trim();
}
```

## 🧪 Testing

### Compile

```bash
cd mcp
npm run build
```

### Verify Output

Check that `dist/index.cjs` includes the template modules:

```
modules by path ./src/templates/env-setup/*.ts  33.1 KiB  5 modules
```

## 📝 Best Practices

1. **Keep components pure** - Components should only render HTML, no side effects
2. **Use TypeScript** - All files are TypeScript for type safety
3. **Escape user input** - Use `escapeHtml()` helper for user-provided strings
4. **Trim output** - Always `.trim()` component output to avoid extra whitespace
5. **Add console logs** - Log important events for debugging
6. **Use semantic HTML** - Proper heading levels, ARIA labels, etc.

## 🔗 Related Files

- `../../interactive-server.ts` - Server that uses this template
- `../../tools/interactive.ts` - Tool that triggers the page

## 💡 Tips

- **Debugging**: Check browser console for `[env-setup]` prefixed logs
- **WebSocket**: Ensure port matches between server and client
- **Styling**: Use browser dev tools to inspect and test CSS changes
- **Search**: Search functionality works on both alias and environment ID

## 🚀 Future Enhancements

Potential improvements:

- [ ] Add keyboard shortcuts (Enter to confirm, Esc to cancel)
- [ ] Support drag-and-drop sorting
- [ ] Add environment creation time sorting
- [ ] Multi-select environments
- [ ] Theme toggle (dark/light mode)
- [ ] Internationalization (i18n)

---

For more information, see:
- `../../../specs/env-ui-optimization/` - Full design documentation








