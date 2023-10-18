describe('API page', { scrollBehavior: false }, () => {
  it('load well', () => {
    //@ts-ignore
    cy.login('tester@foo.bar', 'password')
      .visit('http://localhost:9000/testers/test-api/1.0.0/description')
      .get('h1').should(($div) => {
        expect($div.text().trim()).contains('test API');
      })
      .wait(500)
      .get('.block__entry__link').contains('Plans').click()
      .get('.card').should('have.length', 2)
      .get('.block__entry__link').contains('Documentation').click()
      .get('.api-description #introduction').should('have.text', 'Introduction')
      .get('.block__entry__link').contains('OpenAPI').click()
      .get('.redoc-wrap').should('be.visible')
      .get('.block__entry__link').contains('Testing').click()
      .get('#swagger-ui .swagger-ui').should('be.visible');
  });
});

describe('Notification page', () => {
  it('load well', () => {
    //@ts-ignore
    cy.login('tester@foo.bar', 'password')
      .visit('http://localhost:9000/apis')
      .get('.navbar a.notification-link').click()
      .url().should('include', '/notifications')
      .get('.wrapper h1').should('have.text', 'Notifications (1)')
      .get(('div.alert.section')).should('have.length', 1);
  });
});

describe('Profile page', () => {
  it('load well', () => {
    //@ts-ignore
    cy.login('tester@foo.bar', 'password')
      .visit('http://localhost:9000/me')
      .get('input[name="email"]').should('have.value', 'tester@foo.bar');
  });
});

describe('Team apis page', { scrollBehavior: false }, () => {
  it('load well', () => {
    //@ts-ignore
    cy.login('tester@foo.bar', 'password')
      .visit('http://localhost:9000/testers')
      .get('h1.jumbotron-heading').should('have.text', 'Testers');
  });
})

describe('Team back-office', { scrollBehavior: false }, () => {
  // it('load well', () => {
  //   //@ts-ignore
  //   cy.login('tester@foo.bar', 'password')
  //     .visit('http://localhost:9000/testers/settings')
  //     .get('main h1').should('have.text', 'Testers');
  // });

  it('Team APIs works', () => {
    //@ts-ignore
    cy.login('tester@foo.bar', 'password')
      .visit('http://localhost:9000/testers/settings')
      .get('.block__entry__link').contains('APIs').click()
      .url().should('include', '/testers/settings/apis')
      .get('table tbody tr').should('have.length', 3);
  });

  // it('Team income works', () => {
  //   //@ts-ignore
  //   cy.login('tester@foo.bar', 'password')
  //     .visit('http://localhost:9000/testers/settings')
  //     .get('.block__entry__link').contains('Billing').click()
  //     .url().should('include', '/testers/settings/billing')
  //     .get('.submenu__entry__link').contains('Income').click()
  //     .url().should('include', '/testers/settings/income')
  //     // .get('.month__and__total button.btn-access-negative').click()
  //     .get('.col.apis').should('be.visible')
  //     .get('.api__billing__card').click()
  //     .get('.col.apikeys h3').should('have.text', 'test API');
  // });

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
    //@ts-ignore
    cy.login('tester@foo.bar', 'password')
      .visit('http://localhost:9000/testers/settings')
      .get('.submenu__entry__link').contains('Assets').click()
      .url().should('include', '/testers/settings/assets')
      .get('.wrapper h3').should('have.text', 'Something went wrong: No bucket config found !');
  });

  it('Team Api keys works', () => {
    //@ts-ignore
    cy.login('tester@foo.bar', 'password')
      .visit('http://localhost:9000/testers/settings')
      .get('.block__entry__link').contains('API keys').click()
      .url().should('include', '/testers/settings/apikeys')
      .get('main h1').should('have.text', 'Subscribed APIs')
      .get('table tbody tr').should('have.length', 1)
      .get('table tbody tr a.btn').first().click()
      .url().should('include', '/testers/settings/apikeys/test-api')
      .get('.card').should('have.length', 1);

  });
});