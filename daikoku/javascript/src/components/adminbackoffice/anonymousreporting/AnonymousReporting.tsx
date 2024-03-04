import React, {useContext, useEffect, useState} from 'react';
import { useDaikokuBackOffice } from '../../../contexts';
import {I18nContext} from "../../../contexts/i18n-context";
import {Can, daikoku, manage} from "../../utils";
import {BooleanInput} from "@maif/react-forms";

export const AnonymousReporting = () => {
  useDaikokuBackOffice();
  const { translate, Translation } = useContext(I18nContext);
  const [isAnonEnabled, setIsAnonEnabled] = useState<boolean>()
  useEffect(() => {

  }, [isAnonEnabled]);
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
              <BooleanInput onChange={setIsAnonEnabled} value={isAnonEnabled}/>
            </div>
          </div>
          </div>
      </div>
    </Can>
  )
}