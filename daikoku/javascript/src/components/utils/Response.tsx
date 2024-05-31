import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { I18nContext } from '../../contexts';
export const Response = () => {
    const { translate } = useContext(I18nContext);


    return (
        <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
            <div className="alert alert-info" role="alert">
                Thank you for your response
            </div>
            <div className="d-flex justify-content-end">
                <Link className='btn btn-outline-success' to="/">{translate('go_back')}</Link>
            </div>
        </div>
    )
}