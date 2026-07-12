import { sideGroups, type NavItem } from '../config/navigation';

const siteTitle = 'OL-DOC';

const navItems = sideGroups.flatMap(({ items }) => items.flatMap((item): NavItem[] => [item, ...(item.children ?? [])]));

export const getDocumentTitle = (path: string): string => {
  if (path === '/') {
    return siteTitle;
  }

  const item = navItems.find(({ to }) => to === path);
  return item ? `${item.label} | ${siteTitle}` : siteTitle;
};
