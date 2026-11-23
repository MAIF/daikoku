import classNames from 'classnames';

export type TabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

type TabsProps<T extends string> = {
  idPrefix: string;
  label: string;
  tabs: Array<TabItem<T>>;
  activeTab: T;
  onChange: (id: T) => void;
  variant?: 'tabs' | 'segmented';
};

export const tabId = (idPrefix: string, id: string) => `${idPrefix}-tab-${id}`;
export const tabPanelId = (idPrefix: string, id: string) => `${idPrefix}-panel-${id}`;

export const Tabs = <T extends string>(props: TabsProps<T>) => (
  <div
    role="tablist"
    aria-label={props.label}
    className={classNames('daikoku-tabs', `--${props.variant ?? 'tabs'}`)}
  >
    {props.tabs.map((tab) => {
      const active = tab.id === props.activeTab;

      return (
        <button
          key={tab.id}
          id={tabId(props.idPrefix, tab.id)}
          type="button"
          role="tab"
          aria-selected={active}
          aria-controls={tabPanelId(props.idPrefix, tab.id)}
          className={classNames('daikoku-tabs__tab', { active })}
          onClick={() => props.onChange(tab.id)}
        >
          <span className="daikoku-tabs__label">{tab.label}</span>
          {!!tab.count && (
            <span className={classNames('number-indicator', { '--inactive': !active })}>{tab.count}</span>
          )}
        </button>
      );
    })}
  </div>
);
