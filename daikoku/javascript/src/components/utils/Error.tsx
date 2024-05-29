import {useLocation, useNavigate} from 'react-router-dom';
export const Error = () => {
    const {hash} = useLocation();
    const navigate = useNavigate();
    const decodedHash = hash ? atob(hash.slice(1)) : '???'

    return (
        <div>
            <div>Error: {decodedHash}</div>
            <button type='button' className='btn btn-access-primary' onClick={() => navigate("/")}>Go Home</button>
        </div>
    )
}