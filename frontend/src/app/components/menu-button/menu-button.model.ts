import { TemplateRef } from '@angular/core';

/** Discriminator for every row type the menu-button can render. */
export type MenuButtonItemType =
  | 'action'
  | 'checkbox'
  | 'toggle'
  | 'separator'
  | 'template';

interface MenuButtonItemBase {
  /** Stable id — handy for tracking, testing and analytics. */
  id?: string;
  /** Dim the row and block interaction. */
  disabled?: boolean;
  /** Arbitrary payload for future nested / contextual menus. */
  data?: unknown;
}

/** A clickable row that runs a callback and/or emits `itemClick`. */
export interface MenuButtonActionItem extends MenuButtonItemBase {
  type: 'action';
  label: string;
  icon?: string;
  action?: () => void;
  /** Close the menu after activation. Default: `true`. */
  closeOnClick?: boolean;
}

/** A row with a checkbox indicator. */
export interface MenuButtonCheckboxItem extends MenuButtonItemBase {
  type: 'checkbox';
  label: string;
  icon?: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Close the menu after toggling. Default: `false`. */
  closeOnClick?: boolean;
}

/** A row with an on/off switch. */
export interface MenuButtonToggleItem extends MenuButtonItemBase {
  type: 'toggle';
  label: string;
  icon?: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Close the menu after toggling. Default: `false`. */
  closeOnClick?: boolean;
}

/** A visual divider between groups of rows. */
export interface MenuButtonSeparatorItem {
  type: 'separator';
}

/** Escape hatch: render any caller-provided template as a row. */
export interface MenuButtonTemplateItem extends MenuButtonItemBase {
  type: 'template';
  template: TemplateRef<{ $implicit: MenuButtonTemplateItem }>;
}

export type MenuButtonItem =
  | MenuButtonActionItem
  | MenuButtonCheckboxItem
  | MenuButtonToggleItem
  | MenuButtonSeparatorItem
  | MenuButtonTemplateItem;

/** Items whose interaction produces a boolean state change. */
export type MenuButtonSelectableItem =
  | MenuButtonCheckboxItem
  | MenuButtonToggleItem;
