import { Plus, Trash2 } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import Select, { components, OptionProps } from 'react-select';
import CreatableSelect from 'react-select/creatable';

import { I18nContext, ModalContext } from '../../../contexts';
import * as Services from '../../../services';
import { OtoroshiEntitiesSelectorProps, OtoroshiEntity } from '../../../types';

type Option = {
  type: 'group' | 'route';
  label: string;
  value: string;
  enabled: boolean;
};

type ExtraProps = {
  labelKey: string;
  labelKeyAll: string;
  getEnabledValue: (data: string) => number
};

const CustomOption = (props: OptionProps<Option, true> & { selectProps: ExtraProps }) => {
  const { data, innerRef, innerProps } = props;
  const { translate } = useContext(I18nContext);

  return (
    <div ref={innerRef} {...innerProps}
      className="d-flex align-items-center px-3 py-2 cursor-pointer select-menu-item gap-2">
      <div className="col-1">
        {data.type !== 'group' && !data.enabled && (
          <span className="badge --danger">
            {translate("Disabled")}
          </span>
        )}
      </div>

      <span>{data.label}</span>

    </div>
  );
};

export const OtoroshiEntitiesSelector = ({
  rawValues,
  onChange,
  translate,
  ownerTeam
}: OtoroshiEntitiesSelectorProps) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [groups, setGroups] = useState<Array<OtoroshiEntity>>([]);
  const [services, setServices] = useState<Array<OtoroshiEntity>>([]);
  const [routes, setRoutes] = useState<Array<OtoroshiEntity>>([]);
  const [disabled, setDisabled] = useState<boolean>(true);
  const [value, setValue] = useState<any>(undefined);
  const { Translation } = useContext(I18nContext);

  useEffect(() => {
    const otoroshiTarget = rawValues;

    if (otoroshiTarget && otoroshiTarget.otoroshiSettings) {
      Promise.all([
        Services.getOtoroshiGroupsAsTeamAdmin(
          ownerTeam._id,
          otoroshiTarget.otoroshiSettings
        ),
        Services.getOtoroshiServicesAsTeamAdmin(
          ownerTeam._id,
          otoroshiTarget.otoroshiSettings
        ),
        Services.getOtoroshiRoutesAsTeamAdmin(
          ownerTeam._id,
          otoroshiTarget.otoroshiSettings
        ),
      ])
        .then(([groups, services, routes]) => {
          if (!groups.error)
            setGroups(
              groups.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'group',
                enabled: g.enabled
              }))
            );
          else setGroups([]);
          if (!services.error)
            setServices(
              services.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'service',
                enabled: g.enabled
              }))
            );
          else setServices([]);
          if (!routes.error)
            setRoutes(
              routes.map((g: any) => ({
                label: g.name,
                value: g.id,
                type: 'route',
                enabled: g.enabled
              }))
            );
          else setRoutes([]);
        })
        .catch(() => {
          setGroups([]);
          setServices([]);
          setRoutes([]);
        });
    }
    setDisabled(!otoroshiTarget || !otoroshiTarget.otoroshiSettings);
  }, [rawValues.otoroshiSettings, rawValues, ownerTeam._id]);

  useEffect(() => {
    if (groups && services && routes) {
      setLoading(false);
    }
  }, [services, groups, routes]);

  useEffect(() => {
    if (
      !!groups &&
      !!services &&
      !!routes &&
      !!rawValues.authorizedEntities
    ) {
      setValue(
        [
          ...rawValues.authorizedEntities.groups.map(
            (authGroup: any) =>
              (groups as any).find((g: any) => g.value === authGroup)
          ),
          ...(rawValues.authorizedEntities.services || []).map(
            (authService: any) =>
              (services as any).find((g: any) => g.value === authService)
          ),
          ...(rawValues.authorizedEntities.routes || []).map(
            (authRoute: any) =>
              (routes as any).find((g: any) => g.value === authRoute)
          ),
        ].filter((f) => f)
      );
    }
  }, [rawValues, groups, services, routes]);

  const onValueChange = (v: any) => {
    if (!v) {
      onChange(null);
      setValue(undefined);
    } else {
      const value = v.reduce(
        (acc: any, entitie: any) => {
          switch (entitie.type) {
            case 'group':
              return {
                ...acc,
                groups: [
                  ...acc.groups,
                  groups.find((g) => g.value === entitie.value)?.value,
                ],
              };
            case 'service':
              return {
                ...acc,
                services: [
                  ...acc.services,
                  services.find((s) => s.value === entitie.value)?.value,
                ],
              };
            case 'route':
              return {
                ...acc,
                routes: [
                  ...acc.routes,
                  routes.find((s: any) => s.value === entitie.value)?.value,
                ],
              };
          }
        },
        { groups: [], services: [], routes: [] }
      );
      setValue([
        ...value.groups.map((authGroup: any) =>
          groups.find((g: any) => g.value === authGroup)
        ),
        ...value.services.map((authService: any) =>
          services.find((g: any) => g.value === authService)
        ),
        ...value.routes.map((authRoute: any) =>
          routes.find((g: any) => g.value === authRoute)
        ),
      ]);
      onChange(value);
    }
  };

  const groupedOptions = [
    { label: 'Service groups', options: groups },
    { label: 'Services', options: services },
    { label: 'Routes', options: routes },
  ];

  const formatGroupLabel = (data) => (
    <div className="groupStyles">
      <span>{data.label}</span>
      <span className="groupBadgeStyles">{data.options.length}</span>
    </div>
  );

  return (
    <div>
      <Select
        id={`input-label`}
        isMulti
        name={`search-label`}
        isLoading={loading}
        isDisabled={disabled && !loading}
        placeholder={translate('Authorized.entities.placeholder')} //@ts-ignore //FIXME
        components={{
          Group: components.Group, //@ts-ignore
          Option: CustomOption
        }}
        formatGroupLabel={formatGroupLabel}
        getEnabledValue={(item: string) => {
          //todo: chelou, certaine route sont disable on sait pas pourquoi ?
          return [...groups, ...routes, ...services].find(i => i.value === item)?.enabled
        }} //@ts-ignore
        options={groupedOptions}
        value={value}
        onChange={onValueChange}
        classNamePrefix="reactSelect"
        className="reactSelect"
      />
      <div className="col-12 d-flex flex-row mt-3">
        <div className="d-flex flex-column flex-grow-1">
          <strong className="reactSelect__group-heading">
            <Translation i18nkey="authorized.groups">
              Services Groups
            </Translation>
          </strong>
          {!!value &&
            value
              .filter((x: any) => x.type === 'group')
              .map((g: any, idx: any) => (
                <span className="p-2" key={idx}>
                  {g.label}
                </span>
              ))}
        </div>
        <div className="d-flex flex-column flex-grow-1">
          <strong className="reactSelect__group-heading">
            <Translation i18nkey="authorized.services">Services</Translation>
          </strong>
          {!!value &&
            value
              .filter((x: any) => x.type === 'service')
              .map((g: any, idx: any) => (
                <span className="p-2" key={idx}>
                  {g.label}
                </span>
              ))}
        </div>
        <div className="d-flex flex-column flex-grow-1">
          <strong className="reactSelect__group-heading">
            <Translation i18nkey="authorized.routes">Routes</Translation>
          </strong>
          {!!value &&
            value
              .filter((x: any) => x.type === 'route')
              .map((g: any, idx: any) => (
                <span className="p-2" key={idx}>
                  {g.label}
                </span>
              ))}
        </div>
      </div>
    </div>
  );
};

export const CustomMetadataInput = (props: {
  value?: Array<{ key: string; possibleValues: Array<string> }>;
  onChange?: (param: any) => void;
  setValue?: (key: string, data: any) => void;
  translate: (key: string) => string;
}) => {
  const { alert } = useContext(ModalContext);

  const changeValue = (possibleValues: any, key: string) => {
    const newValues = props.value?.map(v => {
      if (v.key === key) {
        return { ...v, possibleValues }
      } else {
        return v;
      }
    }) || [];
    props.onChange?.(newValues);
  };

  const changeKey = (
    e: React.ChangeEvent<HTMLInputElement>,
    oldName: string
  ) => {
    if (e && e.preventDefault) e.preventDefault();
    // const sanitizedValue = e.target.value.replace(/\./g, '');
    const sanitizedValue = e.target.value;
    const newValues = props.value?.map(v => {
      if (v.key === oldName) {
        return { ...v, key: sanitizedValue }
      } else {
        return v;
      }
    }) || [];

    props.onChange?.(newValues);
  };

  const addFirst = (e: React.MouseEvent<HTMLElement>) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!props.value || props.value.length === 0) {
      props.onChange?.([{ key: '', possibleValues: [] }]);
      alert({
        message: props.translate('custom.metadata.process.change.to.manual'),
        title: props.translate('Information'),
      });
    }
  };

  const addNext = (e: React.MouseEvent<HTMLElement>) => {
    if (e && e.preventDefault) e.preventDefault();
    const newItem = { key: '', possibleValues: [] };
    const newValues = [...(props.value || []), newItem];
    props.onChange?.(newValues);
  };

  const remove = (e: React.MouseEvent<HTMLElement>, key: string) => {
    if (e && e.preventDefault) e.preventDefault();

    props.onChange?.((props.value || []).filter((x: any) => x.key !== key));
  };

  return (
    <div>
      {!props.value?.length && (
        <div className="col-sm-10">
          <button
            type="button"
            className="btn --secondary --small --icon-only"
            onClick={(e) => addFirst(e)}
          >
            <Plus />
          </button>
        </div>
      )}

      {(props.value || []).map(({ key, possibleValues }, idx) => (
        <div key={idx} className="col-sm-10">
          <div className="input-group">
            <input
              type="text"
              className="form-control col-5 me-1"
              value={key}
              onChange={(e) => changeKey(e, key)}
            />
            <CreatableSelect
              isMulti
              onChange={(e) =>
                changeValue(
                  e.map(({ value }) => value),
                  key
                )
              }
              options={undefined}
              value={possibleValues.map((value: any) => ({
                label: value,
                value,
              }))}
              className="input-select reactSelect flex-grow-1"
              classNamePrefix="reactSelect"
            />
            <button
              type="button"
              className="ms-1 btn --secondary --small --icon-only"
              onClick={(e) => remove(e, key)}
            >
              <Trash2 />
            </button>
            {idx === (props.value?.length || 0) - 1 && (
              <button
                type="button"
                className="btn --secondary --small --icon-only"
                onClick={addNext}
              >
                <Plus />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
