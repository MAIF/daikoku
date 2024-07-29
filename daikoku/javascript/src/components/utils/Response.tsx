import { useContext } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { I18nContext } from '../../contexts';

export const Response = () => {
    const { translate, Translation } = useContext(I18nContext);

    const [searchParams, setSearchParams] = useSearchParams();

    console.debug(searchParams.get('message'))
    console.debug(searchParams.get('message') || "response.default.message")
    console.debug(translate(searchParams.get('message') || "response.default.message"))

    return (
        <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
            <div className="alert alert-info" role="alert">
                {translate(searchParams.get('message') || "response.default.message")}
            </div>
            <div className="d-flex justify-content-end">
                <Link className='btn btn-outline-success' to="/">{translate('go_back')}</Link>
            </div>
        </div>
    )
}