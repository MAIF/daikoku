import {useContext, useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {I18nContext, ModalContext} from '../../contexts';
import {GlobalContext} from "../../contexts/globalContext";
import {Description} from "../frontend";

export const Response = () => {
    const {translate, Translation} = useContext(I18nContext);
    const {tenant} = useContext(GlobalContext);
    const {openJoinTeamModal} = useContext(ModalContext);

    const [searchParams, setSearchParams] = useSearchParams();

    const messageId = searchParams.get('message');
    const invitationToken = searchParams.get('invitation-token');

    useEffect(() => {
        if (invitationToken) {
            openJoinTeamModal();
        }
    }, [invitationToken]);

    return (
        <main className='flex-grow-1' role="main">
            <section className="organisation__header col-12 mb-4 p-3">
                <div className="row text-center">
                    <div className="col-sm-4">
                        <img
                            className="organisation__avatar"
                            src={tenant.logo ? tenant.logo : '/assets/images/daikoku.svg'}
                            alt="avatar"
                        />
                    </div>
                    <div className="col-sm-7 d-flex flex-column justify-content-center">
                        <h1 className="jumbotron-heading">
                            {tenant.title ? tenant.title : translate('Your APIs center')}
                        </h1>
                        <Description description={tenant.description}/>
                    </div>
                </div>
            </section>
            {!invitationToken && <div className="section mx-auto mt-3 p-3 pt-4" style={{maxWidth: '448px'}}>
                    <div className="d-flex flex-column align-items-center justify-content-center gap-3">
                        <i className="fas fa-circle-check color-success " style={{fontSize: '3rem'}}></i>
                        <h2>{translate(`response.page.${messageId ?? 'unknown'}.title`)}</h2>
                        <p>{translate(`response.page.${messageId ?? 'unknown'}.description`)}</p>
                    </div>
                </div>
            }
        </main>

    )
}