# @canvasflow/ui

Design system and shared UI components for CanvasFlow.

## Usage

```tsx
import { Button, Card, CardHeader, CardTitle } from '@canvasflow/ui';
import '@canvasflow/ui/styles.css'; // once, in your app root

export function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to CanvasFlow</CardTitle>
      </CardHeader>
      <Button variant="primary" size="md">
        Get started
      </Button>
    </Card>
  );
}
```

## Components

| Component | Variants                                                           |
| --------- | ------------------------------------------------------------------ |
| `Button`  | `primary` `secondary` `outline` `ghost` `danger` × `sm/md/lg/icon` |
| `Input`   | (standard input attrs)                                             |
| `Card`    | `Card.Header` `Title` `Description` `Content` `Footer`             |
| `Badge`   | `default` `brand` `success` `warning` `danger` `outline`           |
| `Heading` | `level: 1-6`, `as` override                                        |
| `Text`    | `size` × `tone` × `weight`                                         |

## Design choices

1. **`cn()` over template strings.** Every component uses `cn(...)` for
   className composition. Combines clsx + tailwind-merge so consumer
   classes correctly override built-in ones.

2. **CVA for variants.** All variant types are derived from the variant
   config via `VariantProps`, never written by hand.

3. **`forwardRef` everywhere.** Consumers can pass a ref to any component
   for focus management, tooltip positioning, etc.

4. **Peer-dependent React.** This package declares React as a peer dep
   so consumers control the React version. Prevents the "two Reacts"
   hooks bug.

5. **Design tokens as CSS vars.** All colors, spacing, and typography
   live in `globals.css` as `--color-*`, `--font-*` etc. Consumers can
   override at the app level without forking the package.
