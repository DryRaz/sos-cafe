'use client';

export default function CategoryNav({
  categories,
  activeId,
  onSelect,
}: {
  categories: { id: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="sticky top-0 z-30 border-b border-espresso/10 bg-cream/95 backdrop-blur">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {categories.map((c) => {
          const isActive = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-forest text-cream' : 'border border-espresso/20 bg-white text-espresso'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
