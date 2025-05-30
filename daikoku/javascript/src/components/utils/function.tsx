import hash from 'object-hash';
import { useContext } from "react";
import { IApi, IFastPlan, ITeamFullGql, ITeamSimple, IUsagePlan, TOption, TOptions } from "../../types";

import { I18nContext } from "../../contexts/i18n-context";

export function partition<T>(array: Array<T>, isValid: (x: T) => boolean): Array<Array<T>> {
  return array.reduce(
    ([pass, fail]: Array<Array<T>>, elem: T) => {
      return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
    },
    [[], []]
  );
}

export const randomColor = () => {
  const maxValue = 0xffffff;
  const random = Math.random() * maxValue;

  const hexCode = Math.floor(random).toString(16).padStart(6, '0');
  return `#${hexCode}`;
};

export const getColorByBgColor = (bgColor: string) => {
  return parseInt(bgColor.replace('#', ''), 16) > 0xffffff / 2 ? '#000' : '#fff';
};

/**
 * @description Change an Array of string to an array of TOption (TOptions).
 * @param array An array of strings.
 * @return TOptions
 * returning a TOptions.
 */
export const arrayStringToTOps = (array: string[]): TOptions => {
  return array.map(string => stringToTOps(string))
}

/**
 * @description Change a string to a TOption.
 * @param val A string that you want to change to a TOption.
 * @return TOption
 * returning a TOption.
 */
export const stringToTOps = (val: string): TOption => {
  return { label: val, value: val }
}

interface FilterType {
  count: number
  selectedCategory?: TOption | undefined
  selectedTag?: TOption | undefined
  selectedProducer?: TOption | undefined
  searched: string
  clearFilter: any
  filterPlan?: string
  seeOnlySubs?: boolean
}

export const FilterPreview = (props: FilterType) => {
  const { translate, Translation } = useContext(I18nContext);


  if (!props.searched && !props.selectedTag && !props.selectedCategory && !props.selectedProducer && !props.filterPlan && !props.seeOnlySubs) {
    return null;
  }

  return (
    <div className="d-flex justify-content-between">
      <div className="preview">
        <strong>{props.count}</strong> {`${translate('result')}${props.count > 1 ? 's' : ''}`}
        &nbsp;
        {!!props.searched && (
          <span>
            {translate('filter.preview.match')} <strong>{props.searched}</strong>&nbsp;
          </span>
        )}
        {props.selectedCategory?.value && (
          <span>
            {translate('filter.preview.category')} <strong>{props.selectedCategory?.value}</strong>
            &nbsp;
          </span>
        )}
        {!!props.selectedTag?.value && (
          <span>
            {translate('filter.preview.tag')} <strong>{props.selectedTag?.value}</strong>
            &nbsp;
          </span>
        )}
        {!!props.selectedProducer?.value && (
            <span>
            {translate('filter.preview.team')} <strong>{props.selectedProducer?.label}</strong>
              &nbsp;
          </span>
        )}
        {props.seeOnlySubs === true && (
          <span>
            {translate('fastMode.onlySubs.info')}
          </span>
        )}
        {!!props.filterPlan && (
          <span>
            {translate('fastMode.planSearch.info')} <strong>{props.filterPlan}</strong>
          </span>
        )}
      </div>
      <div className="clear cursor-pointer" onClick={props.clearFilter}>
        <i className="far fa-times-circle me-1" />
        <Translation i18nkey="clear filter">clear filter</Translation>
      </div>
    </div>
  );
}

export const isSubscriptionProcessIsAutomatic = (plan: IUsagePlan | IFastPlan) => {
  return !plan.subscriptionProcess.length
}

export const isPublish = (api: IApi) => {
  return api.state === 'published'
}

export const teamGQLToSimple = (team: ITeamFullGql): ITeamSimple => {
  return ({
    ...team,
    _tenant: team.tenant._id,
    users: team.users.map(({ user, teamPermission }) => ({ userId: user?.userId, teamPermission }))
  })
}
export const cleanHash = (item: any) => hash(cleanPromise(item))
export const isPromise = (value: any) => {
  return Boolean(value && typeof value.then === 'function');
}
export const cleanPromise = <T extends { [x: string]: any } | any[] | string | number | boolean,>(obj: T): T => {
    if (!!obj && Array.isArray(obj)) {
      return obj.map(cleanPromise) as T
    } else if (!!obj && typeof obj === 'object') {
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => {
        if (isPromise(v)) {
          return [k, `promise-${k}`];
        } else if (typeof v === "object") {
          return [k, cleanPromise(v)];
        } else {
          return [k, v];
        }
      })) as T;
    }
    return obj;
  };

/**
 * Escapes special characters in a string so it can be safely used in a regular expression.
 * Escaped characters: . * + ? ^ $ { } ( ) | [ ] \ /
 *
 * @param {string} string - The string to escape.
 * @returns {string} - The escaped string, safe for use in a regular expression.
 */
export const escapeRegExp = (string) => {
  if (!string) {
    return undefined
  }
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Échappe tous les caractères spéciaux
}
