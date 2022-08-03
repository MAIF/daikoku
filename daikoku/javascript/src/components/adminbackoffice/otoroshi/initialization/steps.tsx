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
// @ts-expect-error TS(6142): Module '../../../../locales/i18n-context' was reso... Remove this comment to see the full error message
import { I18nContext } from '../../../../locales/i18n-context';

export const SelectionStepStep = (props: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <button className="btn btn-outline-primary me-2" onClick={() => props.goToServices()}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Import Otoroshi services">Import Otoroshi Services</Translation>
      </button>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <button className="btn btn-outline-primary" onClick={() => props.goToApikeys()}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Import Otoroshi apikeys">Import Otoroshi Apikeys</Translation>
      </button>
    </div>
  );
};

export const SelectOtoStep = (props: any) => {
  const [otoInstance, setOtoInstance] = useState(undefined);

  useEffect(() => {
    if (otoInstance) {
      props.setOtoInstance(otoInstance);
    }
  }, [otoInstance]);

  const previousState = JSON.parse(
    // @ts-expect-error TS(2345): Argument of type 'string | null' is not assignable... Remove this comment to see the full error message
    localStorage.getItem(`daikoku-initialization-${props.tenant._id}`)
  );

  useEffect(() => {
    if (props.otoroshis.length === 1)
      setOtoInstance({
        // @ts-expect-error TS(2345): Argument of type '{ label: any; value: any; }' is ... Remove this comment to see the full error message
        label: props.otoroshis[0].url,
        value: props.otoroshis[0]._id,
      });
  }, []);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex flex-row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Select
        placeholder={translateMethod('Select an Otoroshi instance')}
        className="add-member-select me-2 reactSelect"
        isDisabled={!props.otoroshis.length}
        isLoading={!props.otoroshis.length}
        options={props.otoroshis.map((s: any) => ({
          label: s.url,
          value: s._id
        }))}
        // @ts-expect-error TS(2322): Type '{ placeholder: any; className: string; isDis... Remove this comment to see the full error message
        selected={otoInstance}
        // @ts-expect-error TS(2345): Argument of type 'SingleValue<undefined>' is not a... Remove this comment to see the full error message
        onChange={(slug) => setOtoInstance(slug)}
        value={otoInstance}
        classNamePrefix="reactSelect"
      />
      {!!previousState && previousState.tenant === props.tenant._id && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="d-flex flex-column">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <BeautifulTitle placement="bottom" title={translateMethod('Load a work in progress')}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button className="btn btn-access" onClick={props.loadPreviousState}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fa fa-download" />
            </button>
          </BeautifulTitle>
        </div>
      )}
    </div>
  );
};

export const RecapServiceStep = (props: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h2>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Api imported">Apis to import</Translation>
      </h2>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ul style={{ listStyleType: 'none' }}>
        {props.teams
          .filter((t: any) => props.createdApis.some((api: any) => api.team === t._id))
          .map((t: any, idx: any) => {
            return (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <li className="mt-3" key={idx}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <h5>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <i className="fas fa-user-friends"></i> {t.name}
                </h5>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <ul>
                  {props.createdApis
                    .filter((s: any) => s.team === t._id)
                    .map((s: any, idx: any) => {
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      return <li key={idx}>{s.name}</li>;
                    })}
                </ul>
              </li>
            );
          })}
      </ul>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex justify-content-end">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button className="btn btn-outline-primary me-1" onClick={() => props.goBackToServices()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fas fa-chevron-left me-1"></i>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Back">Back</Translation>
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button className="btn btn-outline-danger me-1" onClick={props.cancel}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Cancel">Cancel</Translation>
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button className="btn btn-outline-success" onClick={() => props.create()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Create apis">Create APIs</Translation>
        </button>
      </div>
    </div>
  );
};

export const RecapSubsStep = (props: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation, translateMethod } = useContext(I18nContext);

  const reset = () => {
    (window.confirm(translateMethod('initialize_from_otoroshi.confirm')) as any).then((ok: any) => {
    if (ok)
        props.cancel();
});
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mt-3">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h4 className="ms-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="initialize_from_otoroshi.api_keys_imported">
          These api keys will be import
        </Translation>
      </h4>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ul style={{ listStyleType: 'none' }}>
        {props.apis
          .filter((a: any) => props.createdSubs.some((s: any) => s.api._id === a._id))
          .map((a: any, idx: any) => {
            return (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <li className="mt-3" key={idx}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <h5>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <i className="fas fa-atlas"></i> {a.name}
                </h5>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <ul>
                  {props.createdSubs
                    .filter((s: any) => s.api._id === a._id)
                    .filter((s: any) => s.plan)
                    .map((s: any, idx: any) => {
                      return (
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex justify-content-end">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button className="btn btn-outline-primary me-1" onClick={() => props.goBackToServices()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fas fa-chevron-left me-1"></i>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Back">Back</Translation>
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button className="btn btn-outline-danger me-1" onClick={reset}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Reset">Reset</Translation>
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button className="btn btn-outline-success" onClick={() => props.create()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Create subscriptions">Create subscriptions</Translation>
        </button>
      </div>
    </div>
  );
};

export const ServicesStep = (props: any) => {
  const [service, setService] = useState(props.maybeCreatedApi.getOrElse(props.service));
  const [loading, setLoading] = useState(false);
  const [newTeam, setNewTeam] = useState();
  const [selectedTeam, setSelectedTeam] = useState(
    props.maybeCreatedApi.map((api: any) => api.team).getOrNull()
  );
  const [error, setError] = useState({});
  const [inputRef, setInputRef] = useState(null);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
    Services.checkIfApiNameIsUnique(service.name).then(({ exists }) => {
      if (exists) {
        setError({
          name: translateMethod('api.unique.name.error', false, 'Api name must be unique'),
        });
      } else {
        setError({});
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
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="d-flex flex-row flex-wrap">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-6">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h2>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Otoroshi">Otoroshi</Translation>
        </h2>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span style={{ fontWeight: 'bold' }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="init.services.title" replacements={[props.infos.index + 1, props.infos.total]}>
              Api {props.infos.index + 1}/{props.infos.total}
            </Translation>
          </span>{' '}
          : {props.service.name}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <AsyncSelect cacheOptions defaultOptions placeholder={translateMethod('Jump to specific service')} className="add-member-select reactSelect" loadOptions={props.getFilteredServices} onChange={({ value }) => props.goToStep(value)} classNamePrefix="reactSelect"/>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mt-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span style={{ fontWeight: 'bold' }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="api group">Api group</Translation>
          </span>{' '}
          :{' '}
          {props.groups.find((g: any) => g.id === props.service.groupId)
        ? props.groups.find((g: any) => g.id === props.service.groupId).name
        : ''}
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-6">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h2>{props.tenant.name}</h2>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-row align-items-center mb-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-4">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span style={{ fontWeight: 'bold' }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Api name">Api name</Translation>
            </span>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex flex-column col-8">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input type="text" tabIndex="0" ref={(ref) => setInputRef(ref)} className={classNames('form-control', { 'on-error': !!(error as any).name })} value={service.name} onChange={(e) => setService({ ...service, name: e.target.value })}/>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {(error as any).name && <small className="invalid-input-info text-danger">{(error as any).name}</small>}
          </div>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-row align-items-center mb-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-4">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span style={{ fontWeight: 'bold' }}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Api team">Api team</Translation>
              </span>
            </div>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Creatable className="col-8" isClearable={true} isDisabled={loading} isLoading={loading} onChange={(slug, { action }) => {
        setSelectedTeam(action === 'clear' ? undefined : slug.value);
    // @ts-expect-error TS(2322): Type 'Dispatch<SetStateAction<undefined>>' is not ... Remove this comment to see the full error message
    }} onCreateOption={setNewTeam} options={teams} value={teams.find((t: any) => t.value === selectedTeam)} placeholder={translateMethod('Select a team')} formatCreateLabel={(value) => translateMethod('create.team.label', false, `creer l'équipe ${value}`, value)} classNamePrefix="reactSelect"/>
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex justify-content-between col-12 mt-5">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-access" disabled={props.currentStep === 1 ? 'disabled' : null} onClick={() => props.goToStep(1)}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-angle-double-left"/>
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-access me-2" disabled={props.currentStep === 1 ? 'disabled' : null} onClick={props.previousStep}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-angle-left"/>
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {props.maybeCreatedApi.isDefined && (<button className="btn btn-outline-success" onClick={reset}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Reset">Reset</Translation>
            </button>)}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {props.maybeCreatedApi.isDefined && (<button className="btn btn-outline-success me-2" disabled={!selectedTeam || (error as any).name ? 'disabled' : null} onClick={update}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Update">Update</Translation>
            </button>)}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {!props.maybeCreatedApi.isDefined && (<button className="btn btn-outline-success me-2" disabled={!selectedTeam || (error as any).name ? 'disabled' : null} onClick={getIt}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Import">Import this service</Translation>
            </button>)}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-access ms-2" onClick={nextStep}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-angle-right"/>
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-access" disabled={props.currentStep === props.totalSteps ? 'disabled' : null} onClick={() => props.goToStep(props.totalSteps)}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-angle-double-right"/>
          </button>
        </div>

        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-outline-danger me-2" onClick={props.cancel}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Cancel">Cancel</Translation>
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-outline-success" onClick={props.recap}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Select
      options={orderBy(apis, ['label'])}
      // @ts-expect-error TS(2322): Type '{ options: any[]; style: { with: string; }; ... Remove this comment to see the full error message
      style={{ with: '175px' }}
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
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return possiblePlans.length > 0 ? (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  return selectedApi ? (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
  const [selectedEntity, setSelectedEntity] = useState();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return <ApiKey apikey={apikey} key={apikey.clientId} {...props} />;
      },
    },
  ];

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex flex-column">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex align-items-center mx-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span style={{ fontWeight: 'bold' }} className="me-2">
          {translateMethod('initialize_from_otoroshi.api_keys_of')}
        </span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Select
          className="w-50"
          // @ts-expect-error TS(2559): Type '(props: any) => Element' has no properties i... Remove this comment to see the full error message
          components={(props: any) => <components.Group {...props} />}
          options={[
            { label: 'Services', options: orderBy(services, ['label']) },
            { label: 'Service groups', options: orderBy(groups, ['label']) },
          ]}
          // @ts-expect-error TS(2322): Type 'Dispatch<SetStateAction<undefined>>' is not ... Remove this comment to see the full error message
          onChange={setSelectedEntity}
          value={selectedEntity}
          placeholder={translateMethod('initialize_from_otoroshi.select_group')}
          classNamePrefix="reactSelect"
        />
      </div>
      {selectedEntity && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="d-flex flex-column mt-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Table
            // @ts-expect-error TS(2322): Type '{ selfUrl: string; defaultTitle: string; def... Remove this comment to see the full error message
            selfUrl="apis"
            defaultTitle="Team Apis"
            defaultValue={() => ({})}
            defaultSort="name"
            itemName="api"
            columns={columns}
            fetchItems={() => props.getFilteredApikeys(selectedEntity)}
            showActions={false}
            showLink={false}
            extractKey={(item: any) => item._id}
          />
        </div>
      )}

      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="ml-auto">
        {props.createdSubs.length <= 0 && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <button className="btn btn-outline-danger me-2" onClick={props.cancel}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Cancel">Cancel</Translation>
          </button>
        )}
      </div>
    </div>
  );
};

const ApiKey = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
  const [error, setError] = useState({ plan: false, api: false, team: false });

  // @ts-expect-error TS(2345): Argument of type '() => () => null' is not assigna... Remove this comment to see the full error message
  useEffect(() => {
    if (selectedApi) {
      const api = props.apis.find((a: any) => selectedApi._id === a._id);
      setSelectedApi(api);

      if (selectedPlan) {
        setSelectedPlan(api.possibleUsagePlans.find((pp: any) => pp._id === selectedPlan._id));
      }
    }

    //remove document.OnKeyDown listener
    return () => (document.onkeydown = null);
  }, [props.apis]);

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

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="d-flex flex-row justify-content-between">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="flex-grow-1 me-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <SelectApi apis={apis} setSelectedApi={setSelectedApi} selectedApi={selectedApi}/>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="flex-grow-1 me-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <SelectPlan possiblePlans={possiblePlans} selectedPlan={selectedPlan} loadingPlan={loadingPlan} setSelectedPlan={setSelectedPlan} setNewPlan={setNewPlan} selectedApi={selectedApi}/>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="flex-grow-1 me-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <SelectTeam loading={loading} setNewTeam={setNewTeam} selectedTeam={selectedTeam} teams={teams} setSelectedTeam={setSelectedTeam} selectedApi={selectedApi}/>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <button className={`btn btn-outline-${props.maybeCreatedSub(props.apikey).isDefined ? 'warning' : 'success'}`} disabled={!selectedTeam || (error as any).name || !selectedPlan ? 'disabled' : null} onClick={props.maybeCreatedSub(props.apikey).isDefined ? remove : getIt}>
        {props.maybeCreatedSub(props.apikey).isDefined
        ? translateMethod('initialize_from_otoroshi.remove')
        : translateMethod('initialize_from_otoroshi.add')}
      </button>
    </div>);
};
