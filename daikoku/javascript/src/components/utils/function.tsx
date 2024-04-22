import { IApi, IFastApi, IFastPlan, ITeamFull, ITeamFullGql, ITeamSimple, IUsagePlan, TOption, TOptions } from "../../types";
import React, { useContext } from "react";
import { I18nContext } from "../../contexts/i18n-context";

export function partition(array: any, isValid: any) {
  return array.reduce(
    ([pass, fail]: Array<any>, elem: any) => {
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
  searched: string
  clearFilter: any
  filterPlan?: string
  seeOnlySubs?: boolean
}

export const FilterPreview = (props: FilterType) => {
  const { translate, Translation } = useContext(I18nContext);


  if (!props.searched && !props.filterPlan && !props.seeOnlySubs) {
    return null;
  }

  return (
    <div className="d-flex justify-content-between">
      <div className="preview">
        <strong>{props.count}</strong> {`${translate('result')}${props.count > 1 ? 's' : ''}`}
        &nbsp;
        {!!props.searched && (
          <span>
            {translate('matching')} <strong>{props.searched}</strong>&nbsp;
          </span>
        )}
        {props.selectedCategory?.value && (
          <span>
            {translate('categorised in')} <strong>{props.selectedCategory?.value}</strong>
            &nbsp;
          </span>
        )}
        {!!props.selectedTag?.value && (
          <span>
            {translate('tagged')} <strong>{props.selectedTag?.value}</strong>
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
    users: team.users.map(({ user: { userId }, teamPermission }) => ({ userId, teamPermission }))
  })
}
