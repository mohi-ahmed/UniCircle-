import React from 'react';
import { CATEGORIES } from './market.js';

const symbols = { Books: '▤', Electronics: '⌁', 'Study Supplies': '✎', Sports: '◉', Clothing: '◇', Other: '□' };

export function ItemVisual({ item }) {
  const photo = /^item-([0-5])$/.exec(item.id);
  if (!item.photo && photo) return <div className={'item-visual photo-tile photo-' + photo[1]} aria-hidden="true" />;
  return item.photo
    ? <img className="item-visual" src={item.photo} alt={item.title} />
    : <div aria-hidden="true" className={'item-visual placeholder tint-' + CATEGORIES.indexOf(item.category)}>
      <span>{symbols[item.category] ?? '□'}</span><small>{item.category}</small>
    </div>;
}

export function Badge({ children }) {
  return <span className="badge">{children}</span>;
}
