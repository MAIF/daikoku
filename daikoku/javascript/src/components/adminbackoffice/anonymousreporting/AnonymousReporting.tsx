import React, {useContext, useEffect, useState} from 'react';
import { useDaikokuBackOffice } from '../../../contexts';
import {I18nContext} from "../../../contexts/i18n-context";
import {Can, daikoku, manage} from "../../utils";
import {BooleanInput} from "@maif/react-forms";
import * as Services from '../../../services';
import {toastr} from "react-redux-toastr";

export const AnonymousReporting = () => {
  useDaikokuBackOffice();
  const { translate } = useContext(I18nContext);
  const [isAnonEnabled, setIsAnonEnabled] = useState<boolean>(false)
  const [daikokuId, setDaikokuId] = useState<string>()
  useEffect(() => {
    Services.getAnonymousState().then(res =>{
      setIsAnonEnabled(res.activated)
      setDaikokuId(res.id)
    })
  }, []);

  const changeValue = (value: boolean) => {
    if (daikokuId) {
      Services.updateAnonymousState(daikokuId, value).then(() => {
        setIsAnonEnabled(value)
        toastr.success(translate('Success'), translate(value ? "anonymous.reporting.success.enabled" : "anonymous.reporting.success.disabled" ))
      })
  } else {
      toastr.error(translate('Error'), translate("anonymous.reporting.error"))
      setIsAnonEnabled(!value)

    }
  }

  return (
    <Can I={manage} a={daikoku} dispatchError>
      <div className="row">
        <div className="col">
          <h1>
            {translate('Anonymous reporting')}
          </h1>
          <div className="section p-3">
            <div className="d-flex justify-content-start align-items-center mt-2">
              <label className="me-3">{translate('Enable anonymous reporting')}</label>
              <BooleanInput onChange={changeValue} value={isAnonEnabled}/>
            </div>
          </div>
          </div>
      </div>
    </Can>
  )
}