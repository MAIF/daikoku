import React, { useState, useEffect, useContext } from 'react';
import Select, { components } from 'react-select';
import Creatable from 'react-select/creatable';
import AsyncSelect from 'react-select/async';
import classNames from 'classnames';
import orderBy from 'lodash/orderBy';
import cloneDeep from 'lodash/cloneDeep';

import { Table } from '../../../inputs';
import * as Services from '../../../../services';
import { newPossibleUsagePlan, BeautifulTitle, formatPlanType, Option } from '../../../utils';
import { I18nContext } from '../../../../locales/i18n-context';

export const SelectionStepStep = (props: any) => {
  const { Translation } = useContext(I18nContext);
  return (
    <div className="d-flex">
      <button className="btn btn-outline-primary me-2" onClick={() => props.goToServices()}>
        <Translation i18nkey="Import Otoroshi services">Import Otoroshi Services</Translation>
      </button>
      <button className="btn btn-outline-primary" onClick={() => props.goToApikeys()}>
        <Translation i18nkey="Import Otoroshi apikeys">Import Otoroshi Apikeys</Translation>
      </button>
    </div>
  );
};

export const SelectOtoStep = (props: any) => {
  const [otoInstance, setOtoInstance] = useState<any>(undefined);

  useEffect(() => {
    if (otoInstance) {
      props.setOtoInstance(otoInstance);
    }
  }, [otoInstance]);

  const previousState = JSON.parse(localStorage.getItem(`daikoku-initialization-${props.tenant._id}`) || "{}");

  useEffect(() => {
    if (props.otoroshis.length === 1)
      setOtoInstance({
        label: props.otoroshis[0].url,
        value: props.otoroshis[0]._id,
      });
  }, []);

  const { translateMethod } = useContext(I18nContext);

  return (
    <div className="d-flex flex-row">
      <Select
        placeholder={translateMethod('Select an Otoroshi instance')}
        className="add-member-select me-2 reactSelect"
        isDisabled={!props.otoroshis.length}
        isLoading={!props.otoroshis.length}
        options={props.otoroshis.map((s: any) => ({
          label: s.url,
          value: s._id
        }))}
        onChange={(slug) => setOtoInstance(slug)}
        value={otoInstance}
        classNamePrefix="reactSelect"
      />
      {!!previousState && previousState.tenant === props.tenant._id && (
        <div className="d-flex flex-column">
          <BeautifulTitle placement="bottom" title={translateMethod('Load a work in progress')}>
            <button className="btn btn-access" onClick={props.loadPreviousState}>
              <i className="fa fa-download" />
            </button>
          </BeautifulTitle>
        </div>
      )}
    </div>
  );
};

export const RecapServiceStep = (props: any) => {
  const { Translation } = useContext(I18nContext);

  return (
    <div>
      <h2>
        <Translation i18nkey="Api imported">Apis to import</Translation>
      </h2>
      <ul style={{ listStyleType: 'none' }}>
        {props.teams
          .filter((t: any) => props.createdApis.some((api: any) => api.team === t._id))
          .map((t: any, idx: any) => {
            return (
              <li className="mt-3" key={idx}>
                <h5>
                  <i className="fas fa-user-friends"></i> {t.name}
                </h5>
                <ul>
                  {props.createdApis
                    .filter((s: any) => s.team === t._id)
                    .map((s: any, idx: any) => {
                      return <li key={idx}>{s.name}</li>;
                    })}
                </ul>
              </li>
            );
          })}
      </ul>
      <div className="d-flex justify-content-end">
        <button className="btn btn-outline-primary me-1" onClick={() => props.goBackToServices()}>
          <i className="fas fa-chevron-left me-1"></i>
          <Translation i18nkey="Back">Back</Translation>
        </button>
        <button className="btn btn-outline-danger me-1" onClick={props.cancel}>
          <Translation i18nkey="Cancel">Cancel</Translation>
        </button>
        <button className="btn btn-outline-success" onClick={() => props.create()}>
          <Translation i18nkey="Create apis">Create APIs</Translation>
        </button>
      </div>
    </div>
  );
};

export const RecapSubsStep = (props: any) => {
  const { Translation, translateMethod } = useContext(I18nContext);

  const reset = () => {
    //@ts-ignore //FIXME when monkey patch & ts will be compatible
    window.confirm(translateMethod('initialize_from_otoroshi.confirm')).then((ok: any) => {
      if (ok)
        props.cancel();
    });
  };

  return (
    <div className="mt-3">
      <h4 className="ms-3">
        <Translation i18nkey="initialize_from_otoroshi.api_keys_imported">
          These api keys will be import
        </Translation>
      </h4>
      <ul style={{ listStyleType: 'none' }}>
        {props.apis
          .filter((a: any) => props.createdSubs.some((s: any) => s.api._id === a._id))
          .map((a: any, idx: any) => {
            return (
              <li className="mt-3" key={idx}>
                <h5>
                  <i className="fas fa-atlas"></i> {a.name}
                </h5>
                <ul>
                  {props.createdSubs
                    .filter((s: any) => s.api._id === a._id)
                    .filter((s: any) => s.plan)
                    .map((s: any, idx: any) => {
                      return (
                        <li key={idx}>
                          {s.plan.customName || s.plan.type}/{s.clientName}
                        </li>
                      );
                    })}
                </ul>
              </li>
            );
          })}
      </ul>
      <div className="d-flex justify-content-end">
        <button className="btn btn-outline-primary me-1" onClick={() => props.goBackToServices()}>
          <i className="fas fa-chevron-left me-1"></i>
          <Translation i18nkey="Back">Back</Translation>
        </button>
        <button className="btn btn-outline-danger me-1" onClick={reset}>
          <Translation i18nkey="Reset">Reset</Translation>
        </button>
        <button className="btn btn-outline-success" onClick={() => props.create()}>
          <Translation i18nkey="Create subscriptions">Create subscriptions</Translation>
        </button>
      </div>
    </div>
  );
};

export const ServicesStep = (props: any) => {
  const [service, setService] = useState(props.maybeCreatedApi.getOrElse(props.service));
  const [loading, setLoading] = useState(false);
  const [newTeam, setNewTeam] = useState<string>();
  const [selectedTeam, setSelectedTeam] = useState(
    props.maybeCreatedApi.map((api: any) => api.team).getOrNull()
  );
  const [error, setError] = useState<{name: string}>();
  const [inputRef, setInputRef] = useState<HTMLInputElement | null>();

  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    if (newTeam) {
      setLoading(true);
      Services.fetchNewTeam()
        .then((t) => ({ ...t, name: newTeam }))
        .then((t) => Services.createTeam(t))
        .then((t) => {
          props.addNewTeam(t);
          setSelectedTeam(t._id);
          setNewTeam(undefined);
          setLoading(false);
        });
    }
  }, [newTeam]);

  useEffect(() => {
    Services.checkIfApiNameIsUnique(service.name)
      .then(({ exists }) => {
        if (exists) {
          setError({
            name: translateMethod('api.unique.name.error', false, 'Api name must be unique'),
          });
        } else {
          setError(undefined);
        }
      });
  }, [service]);

  const nextStep = () => {
    if (props.currentStep === props.totalSteps) {
      props.recap();
    } else {
      props.nextStep();
    }
  };

  const getIt = () => {
    props.addService(service, selectedTeam);
    nextStep();
  };

  const update = () => {
    props.updateService(service, selectedTeam);
    nextStep();
  };

  const reset = () => {
    props.resetService();
    setService(props.service);
    setSelectedTeam(null);
  };

  useEffect(() => {
    return () => {
      document.onkeydown = null;
    };
  }, [window.event]);
  const checkKey = (e: any) => {
    if (inputRef && document.activeElement !== inputRef) {
      if (e.keyCode === 37 && props.currentStep > 1) {
        props.previousStep();
      } else if (e.keyCode === 39) {
        if (props.maybeCreatedApi && selectedTeam) {
          props.updateService(service, selectedTeam);
          nextStep();
        } else if (selectedTeam) {
          props.addService(service, selectedTeam);
          nextStep();
        } else {
          nextStep();
        }
      }
    }
  };
  document.onkeydown = checkKey;

  const teams = props.teams.map((t: any) => ({
    label: t.name,
    value: t._id
  }));
  return (<div className="d-flex flex-row flex-wrap">
    <div className="col-6">
      <h2>
        <Translation i18nkey="Otoroshi">Otoroshi</Translation>
      </h2>
      <div>
        <span style={{ fontWeight: 'bold' }}>
          <Translation i18nkey="init.services.title" replacements={[props.infos.index + 1, props.infos.total]}>
            Api {props.infos.index + 1}/{props.infos.total}
          </Translation>
        </span>{' '}
        : {props.service.name}
        <AsyncSelect
          cacheOptions
          defaultOptions
          placeholder={translateMethod('Jump to specific service')}
          className="add-member-select reactSelect"
          loadOptions={props.getFilteredServices} //@ts-ignore //FIXME
          onChange={({ value }) => props.goToStep(value)}
          classNamePrefix="reactSelect" />
      </div>
      <div className="mt-3">
        <span style={{ fontWeight: 'bold' }}>
          <Translation i18nkey="api group">Api group</Translation>
        </span>{' '}
        :{' '}
        {props.groups.find((g: any) => g.id === props.service.groupId)
          ? props.groups.find((g: any) => g.id === props.service.groupId).name
          : ''}
      </div>
    </div>
    <div className="col-6">
      <h2>{props.tenant.name}</h2>
      <div className="d-flex flex-row align-items-center mb-3">
        <div className="col-4">
          <span style={{ fontWeight: 'bold' }}>
            <Translation i18nkey="Api name">Api name</Translation>
          </span>
        </div>
        <div className="d-flex flex-column col-8">
          <input
            type="text"
            tabIndex={0}
            ref={(ref) => setInputRef(ref)}
            className={classNames('form-control', { 'on-error': !!error?.name })}
            value={service.name}
            onChange={(e) => setService({ ...service, name: e.target.value })} />
          {error && <small className="invalid-input-info text-danger">{error.name}</small>}
        </div>
      </div>
      <div className="d-flex flex-row align-items-center mb-3">
        <div className="col-4">
          <div>
            <span style={{ fontWeight: 'bold' }}>
              <Translation i18nkey="Api team">Api team</Translation>
            </span>
          </div>
        </div>
        <Creatable
          className="col-8"
          isClearable={true}
          isDisabled={loading}
          isLoading={loading}
          onChange={(slug, { action }) => {
            setSelectedTeam(action === 'clear' ? undefined : slug.value);
          }}
          onCreateOption={setNewTeam}
          options={teams}
          value={teams.find((t: any) => t.value === selectedTeam)}
          placeholder={translateMethod('Select a team')}
          formatCreateLabel={(value) => translateMethod('create.team.label', false, `creer l'équipe ${value}`, value)}
          classNamePrefix="reactSelect" />
      </div>
    </div>
    <div className="d-flex justify-content-between col-12 mt-5">
      <div />
      <div>
        <button className="btn btn-access" disabled={props.currentStep === 1} onClick={() => props.goToStep(1)}>
          <i className="fas fa-angle-double-left" />
        </button>
        <button className="btn btn-access me-2" disabled={props.currentStep === 1} onClick={props.previousStep}>
          <i className="fas fa-angle-left" />
        </button>
        {props.maybeCreatedApi.isDefined && (<button className="btn btn-outline-success" onClick={reset}>
          <Translation i18nkey="Reset">Reset</Translation>
        </button>)}
        {props.maybeCreatedApi.isDefined && (<button className="btn btn-outline-success me-2" disabled={!selectedTeam || !!error?.name} onClick={update}>
          <Translation i18nkey="Update">Update</Translation>
        </button>)}
        {!props.maybeCreatedApi.isDefined && (<button className="btn btn-outline-success me-2" disabled={!selectedTeam || !!error?.name} onClick={getIt}>
          <Translation i18nkey="Import">Import this service</Translation>
        </button>)}
        <button className="btn btn-access ms-2" onClick={nextStep}>
          <i className="fas fa-angle-right" />
        </button>
        <button className="btn btn-access" disabled={props.currentStep === props.totalSteps} onClick={() => props.goToStep(props.totalSteps)}>
          <i className="fas fa-angle-double-right" />
        </button>
      </div>

      <div>
        <button className="btn btn-outline-danger me-2" onClick={props.cancel}>
          <Translation i18nkey="Cancel">Cancel</Translation>
        </button>
        <button className="btn btn-outline-success" onClick={props.recap}>
          <Translation i18nkey="Finish">Finish</Translation>
        </button>
      </div>
    </div>
  </div>);
};

const SelectApi = ({
  apis,
  setSelectedApi,
  selectedApi
}: any) => {
  const { translateMethod } = useContext(I18nContext);
  return (
    <Select
      options={orderBy(apis, ['label'])}
      onChange={(slug) => setSelectedApi(slug.value)}
      value={apis.find((a: any) => !!selectedApi && a.value._id === selectedApi._id)}
      placeholder={translateMethod('Select an API')}
      className="reactSelect"
      classNamePrefix="reactSelect"
    />
  );
};

const SelectPlan = ({
  possiblePlans,
  selectedApi,
  loadingPlan,
  setNewPlan,
  selectedPlan,
  setSelectedPlan
}: any) => {
  const { translateMethod } = useContext(I18nContext);

  return possiblePlans.length > 0 ? (
    <Creatable
      isClearable
      isDisabled={!selectedApi || loadingPlan}
      isLoading={!selectedApi || loadingPlan}
      onChange={(slug, { action }) => setSelectedPlan(action === 'clear' ? undefined : slug.value)}
      onCreateOption={setNewPlan}
      options={orderBy(possiblePlans, ['label'])}
      value={possiblePlans.find((a: any) => !!selectedPlan && a.value._id === selectedPlan._id)}
      placeholder={translateMethod('Select a plan')}
      formatCreateLabel={(value) =>
        translateMethod('create.plan.label', false, `Create plan ${value}`, value)
      }
      classNamePrefix="reactSelect"
    />
  ) : null;
};

const SelectTeam = ({
  loading,
  setNewTeam,
  teams,
  selectedTeam,
  setSelectedTeam,
  selectedApi
}: any) => {
  const { translateMethod } = useContext(I18nContext);

  return selectedApi ? (
    <Creatable
      isClearable
      isDisabled={loading}
      isLoading={loading}
      onChange={(slug, { action }) => setSelectedTeam(action === 'clear' ? undefined : slug.value)}
      onCreateOption={setNewTeam}
      options={orderBy(teams, ['label'])}
      value={teams.find((t: any) => t.value === selectedTeam)}
      placeholder={translateMethod('Select a team')}
      formatCreateLabel={(value) =>
        translateMethod('create.team.label', false, `creer l'équipe ${value}`, value)
      }
      classNamePrefix="reactSelect"
    />
  ) : null;
};

export const ApiKeyStep = (props: any) => {
  const [selectedEntity, setSelectedEntity] = useState<any>();

  const { translateMethod, Translation } = useContext(I18nContext);

  const groups = props.groups.map((g: any) => ({
    value: g.id,
    label: g.name,
    prefix: 'group_'
  }));
  const services = props.services.map((g: any) => ({
    value: g.id,
    label: g.name,
    prefix: 'service_'
  }));

  const columns = [
    {
      id: 'oto.api.key',
      Header: translateMethod('initialize_from_otoroshi.otoroshi_api_key'),
      style: { textAlign: 'left', width: '20%' },
      accessor: (apikey: any) => apikey.clientName,
      sortType: 'basic',
    },
    {
      id: 'apikey.actions',
      Header: translateMethod('API.s'),
      style: { textAlign: 'left' },
      disableSortBy: true,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const apikey = original;
        return <ApiKey apikey={apikey} key={apikey.clientId} {...props} />;
      },
    },
  ];

  return (
    <div className="d-flex flex-column">
      <div className="d-flex align-items-center mx-3">
        <span style={{ fontWeight: 'bold' }} className="me-2">
          {translateMethod('initialize_from_otoroshi.api_keys_of')}
        </span>
        <Select
          className="w-50" //@ts-ignore //FIXME
          components={(props: any) => <components.Group {...props} />}
          options={[
            { label: 'Services', options: orderBy(services, ['label']) },
            { label: 'Service groups', options: orderBy(groups, ['label']) },
          ]}
          onChange={setSelectedEntity}
          value={selectedEntity}
          placeholder={translateMethod('initialize_from_otoroshi.select_group')}
          classNamePrefix="reactSelect"
        />
      </div>
      {selectedEntity && (
        <div className="d-flex flex-column mt-3">
          <Table
            defaultSort="name"
            columns={columns}
            fetchItems={() => props.getFilteredApikeys(selectedEntity)}
          />
        </div>
      )}

      <div className="ml-auto">
        {props.createdSubs.length <= 0 && (
          <button className="btn btn-outline-danger me-2" onClick={props.cancel}>
            <Translation i18nkey="Cancel">Cancel</Translation>
          </button>
        )}
      </div>
    </div>
  );
};

const ApiKey = (props: any) => {
  const { translateMethod } = useContext(I18nContext);
  const [selectedApi, setSelectedApi] = useState(
    props
      .maybeCreatedSub(props.apikey)
      .map((sub: any) => sub.api)
      .getOrNull()
  );
  const [selectedPlan, setSelectedPlan] = useState(
    props
      .maybeCreatedSub(props.apikey)
      .map((sub: any) => sub.plan)
      .getOrNull()
  );
  const [selectedTeam, setSelectedTeam] = useState(
    props
      .maybeCreatedSub(props.apikey)
      .map((sub: any) => sub.team)
      .getOrNull()
  );

  const [newTeam, setNewTeam] = useState(undefined);
  const [newPlan, setNewPlan] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);

  useEffect(() => {
    if (selectedApi) {
      const api = props.apis.find((a: any) => selectedApi._id === a._id);
      setSelectedApi(api);

      if (selectedPlan) {
        setSelectedPlan(api.possibleUsagePlans.find((pp: any) => pp._id === selectedPlan._id));
      }
    }

    return () => {
      document.onkeydown = null
    }
  }, [props.apis])

  useEffect(() => {
    if (newTeam) {
      setLoading(true);
      Services.fetchNewTeam()
        .then((t) => ({ ...t, name: newTeam }))
        .then((t) => Services.createTeam(t))
        .then((t) => {
          props.addNewTeam(t);
          setSelectedTeam(t._id);
          setNewTeam(undefined);
          setLoading(false);
        });
    }
  }, [newTeam]);

  const getAuthorizedEntitiesFromOtoroshiApiKey = (autorizedOn: any) => {
    const regex = /(group|service)_(.*)/;
    return autorizedOn.reduce(
      ({
        groups,
        services
      }: any, entitie: any) => {
        // eslint-disable-next-line no-unused-vars
        const [_value, type, id] = entitie.match(regex);
        switch (type) {
          case 'group':
            return { groups: [...groups, id], services };
          case 'service':
            return { groups, services: [...services, id] };
        }
      },
      { groups: [], services: [] }
    );
  };

  //add new plan effect
  useEffect(() => {
    if (newPlan) {
      let plans = cloneDeep(selectedApi.possibleUsagePlans);
      const newPossiblePlan = newPossibleUsagePlan(newPlan);
      const plan = {
        ...newPossiblePlan,
        otoroshiTarget: {
          ...newPossiblePlan.otoroshiTarget,
          otoroshiSettings: props.otoroshi,
          authorizedEntities: getAuthorizedEntitiesFromOtoroshiApiKey(
            props.apikey.authorizedEntities
          ),
        },
      };
      plans.push(plan);
      const value = cloneDeep(selectedApi);
      value.possibleUsagePlans = plans;

      setSelectedPlan(plan);
      Promise.resolve(setLoadingPlan(true))
        .then(() => props.updateApi(value))
        .then(() => {
          setNewPlan(undefined);
          setLoadingPlan(false);
        });
    }
  }, [newPlan]);

  //handle error effect
  // useEffect(() => {
  //   setError({ plan: !!selectedPlan, api: !!selectedApi, team: !!selectedTeam });
  //   update();
  // }, [selectedPlan, selectedApi, selectedTeam]);

  const apis = props.apis.map((a: any) => ({
    label: a.name,
    value: a
  }));
  const teams = props.teams.map((t: any) => ({
    label: t.name,
    value: t._id
  }));
  const possiblePlans = Option(props.apis.find((a: any) => selectedApi && a._id === selectedApi._id))
    .map((a: any) => a.possibleUsagePlans)
    .getOrElse([])
    .map((pp: any) => ({
      label: pp.customName || formatPlanType(pp, translateMethod),
      value: pp
    }));

  const getIt = () => {
    props.addSub(props.apikey, selectedTeam, selectedApi, selectedPlan);
  };

  // const update = () => {
  //   if (props.maybeCreatedSub(props.apikey).isDefined)
  //     props.updateSub(props.apikey, selectedTeam, selectedApi, selectedPlan);
  // };

  const remove = () => {
    props.resetSub(props.apikey);
  };

  return (<div className="d-flex flex-row justify-content-between">
    <div className="flex-grow-1 me-2">
      <SelectApi apis={apis} setSelectedApi={setSelectedApi} selectedApi={selectedApi} />
    </div>
    <div className="flex-grow-1 me-2">
      <SelectPlan possiblePlans={possiblePlans} selectedPlan={selectedPlan} loadingPlan={loadingPlan} setSelectedPlan={setSelectedPlan} setNewPlan={setNewPlan} selectedApi={selectedApi} />
    </div>
    <div className="flex-grow-1 me-2">
      <SelectTeam loading={loading} setNewTeam={setNewTeam} selectedTeam={selectedTeam} teams={teams} setSelectedTeam={setSelectedTeam} selectedApi={selectedApi} />
    </div>
    <button
      className={`btn btn-outline-${props.maybeCreatedSub(props.apikey).isDefined ? 'warning' : 'success'}`}
      disabled={!selectedTeam || !selectedPlan}
      onClick={props.maybeCreatedSub(props.apikey).isDefined ? remove : getIt}>
      {props.maybeCreatedSub(props.apikey).isDefined
        ? translateMethod('initialize_from_otoroshi.remove')
        : translateMethod('initialize_from_otoroshi.add')}
    </button>
  </div>);
};
