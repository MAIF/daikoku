import { useContext, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { ModalContext } from '../../contexts';
import { GlobalContext } from '../../contexts/globalContext';
import { I18nContext } from '../../contexts/i18n-context';
import * as Services from '../../services';
import { isError } from '../../types';

/**
 * Migration helper: the color theme system changed and now relies on the
 * `--primary-color` CSS variable (and the rest of the new design tokens) being
 * declared in `:root` by the tenant color-theme CMS page. Tenants whose theme
 * predates that change don't define it, so we warn every admin on each
 * connection (whatever the page) until the theme is fixed — either by resetting
 * it to the new default, or by updating their custom theme through the CLI.
 *
 * This component renders nothing; it only triggers the alert as a side effect.
 * It must live inside the ModalProvider / I18nProvider tree.
 */
export const ColorThemeMigrationAlert = () => {
  const { connectedUser, tenant, isTenantAdmin, reloadContext } = useContext(GlobalContext);
  const { alert, confirm } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);

  const alreadyShown = useRef(false);

  useEffect(() => {
    const isAdmin = isTenantAdmin || connectedUser.isDaikokuAdmin;
    if (!isAdmin || connectedUser.isGuest || alreadyShown.current) {
      return;
    }

    // The theme is considered outdated when the new design tokens are not
    // declared in :root. `--primitive-primary-800` is the canonical marker of the new
    // color-theme system (the legacy default theme never defined it).
    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--primitive-primary-800')
      .trim();

    if (primaryColor) {
      return; // theme already up to date
    }

    alreadyShown.current = true;

    const resetTheme = () =>
      confirm({
        title: translate('tenant.edition.color-theme.reset.confirm.title'),
        message: translate('tenant.edition.color-theme.reset.confirm.message'),
      }).then((ok) => {
        if (ok) {
          Services.resetColorTheme(tenant).then((r) => {
            if (isError(r)) {
              toast.error(r.error);
            } else {
              // The color-theme.css <link> is loaded once in the HTML head, so a
              // full reload is required for the new theme to actually apply.
              reloadContext().then(() => window.location.reload());
            }
          });
        }
      });

    alert({
      title: translate('migration.color-theme.alert.title'),
      message: (
        <div>
          <div className="alert alert-warning mt-3">
            <div>{translate('migration.color-theme.alert.info.1')}</div>
            <div className="mt-2">{translate('migration.color-theme.alert.info.2')}</div>
            <div
              className="mt-2"
              dangerouslySetInnerHTML={{
                __html: translate({
                  key: 'migration.color-theme.alert.info.3',
                  replacements: [
                    `<a class="underline" target="_blank" href='https://maif.github.io/daikoku/docs/usages/tenantusage/customization'>${translate('Documentation')}</a>`,
                  ],
                }),
              }}
            />
          </div>
          <div className="d-flex justify-content-end">
            <button type="button" className="btn --primary" onClick={resetTheme}>
              {translate('migration.color-theme.alert.reset.button')}
            </button>
          </div>
        </div>
      ),
    });
  }, []);

  return null;
};
