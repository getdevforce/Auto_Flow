import { brand } from '../../src/brand';

export function App() {
  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold">{brand.productName}</h1>
      <p className="mt-1 text-muted">{brand.tagline}</p>
    </main>
  );
}
