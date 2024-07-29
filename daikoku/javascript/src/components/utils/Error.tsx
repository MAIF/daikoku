import { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../contexts';
export const Error = () => {
    const { hash } = useLocation();
    const { translate } = useContext(I18nContext);
    
    const decodedHash = hash ? atob(hash.slice(1)) : '???'

    return (
        <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
            <div className="alert alert-danger" role="alert">
                {decodedHash}
            </div>
            <div className="d-flex justify-content-end">
                <Link className='btn btn-outline-success' to="/">{translate('go_back')}</Link>
            </div>
        </div>
    )
}