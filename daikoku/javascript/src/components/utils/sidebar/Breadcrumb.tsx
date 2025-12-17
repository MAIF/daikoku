import { Link, useLocation } from "react-router-dom"


type BreadcrumbProps = {
}
export const Breadcrumb = ({  }: BreadcrumbProps) => {

  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean)


  return (
    <nav className='my-2 breadcrumb-nav' aria-label="fil d'ariane">
      <ol className="breadcrumb">
        <li><Link aria-current={location.pathname === '/apis' ? 'page' : undefined} to='/apis'>Dashboard</Link></li>
        <li><Link aria-current="page" to='/dunder-mifflin-admin-team/admin-api-tenant-default/1.0.0/description'>admin api</Link></li>
      </ol>
    </nav>
  )
}