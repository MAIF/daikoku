describe('Login page & login form', () => {
  it('load well', () => {
    cy
      .clearCookie('daikoku-session')
      .visit('http://localhost:9000/auth/Local/login')
      .get('input[name=username]').type('tester@foo.bar')
      .get('input[name=password]').type('password')
      .get('button').click()
      .url().should('include', '/apis');
  });
});

describe('API page', { scrollBehavior: false }, () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers/test-api/1.0.0/description')
      .get('h1').should(($div) => {
        expect($div.text().trim()).contains('test API');
      })
      .get('.block__entry__link').contains('Plans').click()
      .get('.card').should('have.length', 2)
      .get('.block__entry__link').contains('Documentation').click()
      .get('.api-description #introduction').should('have.text', 'Introduction')
      .get('.block__entry__link').contains('Swagger').click()
      .get('#redoc-container h1').should(($title) => {
        const text = $title.text();
        expect(text).to.include('Swagger Petstore (1.0.0)');
      })
      .get('.block__entry__link').contains('Testing').click()
      .get('#swagger-ui').should('be.visible');
  });
});

describe('Notification page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/apis')
      .get('.navbar a.notification-link').click()
      .url().should('include', '/notifications')
      .get('.wrapper h1').should('have.text', 'Notifications (1)')
      .get(('div.alert.section')).should('have.length', 1);
  });
});

describe('Profile page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/me')
      .get('input[name="email"]').should('have.value', 'tester@foo.bar');
  });
});

describe('Team apis page', { scrollBehavior: false }, () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers')
      .get('h1.jumbotron-heading').should('have.text', 'Testers');
  });
})

describe('Team back-office', { scrollBehavior: false }, () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers/settings')
      .get('main h1').should('have.text', 'Testers');
  });

  it('Team APIs works', () => {
    cy
      .visit('http://localhost:9000/testers/settings')
      .get('.block__entry__link').contains('APIs').click()
      .url().should('include', '/testers/settings/apis')
      .get('table tbody tr').should('have.length', 4)
      .visit('http://localhost:9000/testers/settings/subscriptions/apis/test-api/1.0.0')
      .get('table tbody tr').should('have.length', 2)
      .visit('http://localhost:9000/testers/settings/consumptions/apis/test-api/1.0.0')
      .get('div.data-vizualisation').should('be.visible');

  });

  it('Team income works', () => {
    cy
      .get('.block__entry__link').contains('Billing').click()
      .url().should('include', '/testers/settings/billing')
      .get('.submenu__entry__link').contains('Income').click()
      .url().should('include', '/testers/settings/income')
      .get('.month__and__total button.btn-access-negative').click()
      .waitFor('.col.apis', {
        timeout: 200, // The time in ms to poll for changes
        tries: 300,   // How many times to try before failing
        // 300 tries at 200ms timeout = 1min
      })
      .get('.col.apis').should('be.visible')
      .get('.api__billing__card').click()
      .get('.col.apikeys h3').should('have.text', 'test API');
  });

  // it('Team billing works', () => {
  //   cy
  //     .get('nav#sidebar a.nav-link').contains('Billing').click()
  //     .url().should('include', '/testers/settings/billing')
  //     .get('.month__and__total button.btn-access-negative').click()
  //     .get('.col.apis').should('be.visible')
  //     .get('.api__billing__card').click()
  //     .get('.apikeys h3').should('have.text', 'test API');
  // });

  it('Team assets works', () => {
    cy
      .get('.block__entry__link').contains('Settings').click()
      .get('.submenu__entry__link').contains('Assets').click()
      .url().should('include', '/testers/settings/assets')
      // .get('main h1').should('have.text', 'Testers assets')
      .get('main .alert').should('have.text', 'No bucket config found !');
  });

  it('Team Api keys works', () => {
    cy
      .get('.block__entry__link').contains('API keys').click()
      .url().should('include', '/testers/settings/apikeys')
      .get('main h1').should('have.text', 'Subscribed APIs')
      .get('table tbody tr').should('have.length', 1)
      .get('table tbody tr a.btn').first().click()
      .url().should('include', '/testers/settings/apikeys/test-api')
      .get('.card').should('have.length', 1);

  });
});