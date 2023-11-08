package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.domain.TeamPermission._
import fr.maif.otoroshi.daikoku.domain.UsagePlan._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.AuthorizedEntitiesOtoroshiFormat
import fr.maif.otoroshi.daikoku.env.{DaikokuMode, Env}
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json._
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class MockController(DaikokuAction: DaikokuAction,
                     env: Env,
                     cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext

  val scalaCode: String =
    """```scala
      |import zio.App
      |import zio.console._
      |
      |object MyApp extends App {
      |
      |  def run(args: List[String]) =
      |    myAppLogic.fold(_ => 1, _ => 0)
      |
      |  val myAppLogic =
      |    for {
      |      _    <- putStrLn("Hello! What is your name?")
      |      name <- getStrLn
      |      _    <- putStrLn(s"Hello, ${name}, welcome to ZIO!")
      |    } yield ()
      |}
      |```
    """.stripMargin

  def saveApiDocPages(
      tenant: TenantId): Future[Seq[ApiDocumentationDetailPage]] = {
    val id1 = ApiDocumentationPageId(IdGenerator.token(32))
    val id2 = ApiDocumentationPageId(IdGenerator.token(32))
    val id21 = ApiDocumentationPageId(IdGenerator.token(32))
    val id3 = ApiDocumentationPageId(IdGenerator.token(32))
    val id4 = ApiDocumentationPageId(IdGenerator.token(32))
    for {
      apiDocRepos <- env.dataStore.apiDocumentationPageRepo.forTenantF(tenant)
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id1,
          tenant = tenant,
          // api = api,
          title = "Introduction",
          lastModificationAt = DateTime.now(),
          content =
            "# Introduction\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. \n\n@@@ note \nHello World\n@@@\n\nDuis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id2,
          tenant = tenant,
          // api = api,
          title = "Do This",
          lastModificationAt = DateTime.now(),
          content =
            s"# Do This\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor,\n\n* abc\n* def\n* hij\n\na aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. \n\n$scalaCode\n\nDonec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id21,
          tenant = tenant,
          // api = api,
          title = "and do it well",
          lastModificationAt = DateTime.now(),
          content =
            s"# and do it well\n\nLorem ipsum dolor sit amet, \n\n@@@ warning { title='Achtung !!!' } \nHello World\n @@@ \n\nconsectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id3,
          tenant = tenant,
          // api = api,
          title = "Do That",
          lastModificationAt = DateTime.now(),
          content =
            "# Do That\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. \n\n@@@ warning \nHello World\n@@@\n\n Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. \n\n* 123\n* 456\n* 789\n\nDonec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
      _ <- apiDocRepos.save(
        ApiDocumentationPage(
          id = id4,
          tenant = tenant,
          // api = api,
          title = "FAQ",
          lastModificationAt = DateTime.now(),
          content =
            "# FAQ\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in **pellentesque** justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus"
        )
      )
    } yield {
      Seq(
        ApiDocumentationDetailPage(id = id1,
                                   title = "Introduction",
                                   children = Seq.empty),
        ApiDocumentationDetailPage(
          id = id2,
          title = "Do This",
          children = Seq(
            ApiDocumentationDetailPage(id = id1,
                                       title = "and do it well",
                                       children = Seq.empty),
          )),
        ApiDocumentationDetailPage(id = id3,
                                   title = "Do That ",
                                   children = Seq.empty),
        ApiDocumentationDetailPage(id = id4,
                                   title = "FAQ",
                                   children = Seq.empty)
      )
    }
  }

  def samplePlans(tenantId: TenantId, linkToOtoroshi: Boolean = false) = Seq(
    FreeWithoutQuotas(
      id = UsagePlanId(IdGenerator.token),
      tenant = tenantId,
      billingDuration = BillingDuration(1, BillingTimeUnit.Month),
      currency = Currency("EUR"),
      customName = None,
      customDescription = None,
      allowMultipleKeys = Some(false),
      autoRotation = None,
      subscriptionProcess = Seq.empty,
      integrationProcess = IntegrationProcess.Automatic,
      otoroshiTarget =
        if (linkToOtoroshi)
          Some(
            OtoroshiTarget(
              otoroshiSettings = OtoroshiSettingsId("default"),
              authorizedEntities = Some(AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))))) //FIXME: [#119]
          )
        else None,
    ),
    FreeWithQuotas(
      id = UsagePlanId(IdGenerator.token),
      tenant = tenantId,
      maxPerSecond = 2000,
      maxPerDay = 2000,
      maxPerMonth = 2000,
      billingDuration = BillingDuration(1, BillingTimeUnit.Month),
      currency = Currency("EUR"),
      customName = None,
      customDescription = None,
      allowMultipleKeys = Some(false),
      autoRotation = None,
      subscriptionProcess = Seq.empty,
      integrationProcess = IntegrationProcess.Automatic,
      otoroshiTarget =
        if (linkToOtoroshi)
          Some(
            OtoroshiTarget(
              otoroshiSettings = OtoroshiSettingsId("default"),
              authorizedEntities = Some(AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))))) //FIXME: [#119]
          )
        else None
    ),
    QuotasWithLimits(
      id = UsagePlanId(IdGenerator.token),
      tenant = tenantId,
      maxPerSecond = 10000,
      maxPerDay = 10000,
      maxPerMonth = 10000,
      costPerMonth = BigDecimal(10.0),
      billingDuration = BillingDuration(1, BillingTimeUnit.Month),
      trialPeriod = None,
      currency = Currency("EUR"),
      customName = None,
      customDescription = None,
      allowMultipleKeys = Some(false),
      autoRotation = None,
      subscriptionProcess = Seq.empty,
      integrationProcess = IntegrationProcess.Automatic,
      otoroshiTarget =
        if (linkToOtoroshi)
          Some(
            OtoroshiTarget(
              otoroshiSettings = OtoroshiSettingsId("default"),
              authorizedEntities = Some(AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))))) //FIXME: [#119]
          )
        else None
    ),
    QuotasWithoutLimits(
      id = UsagePlanId(IdGenerator.token),
      tenant = tenantId,
      maxPerSecond = 10000,
      maxPerDay = 10000,
      maxPerMonth = 10000,
      costPerAdditionalRequest = BigDecimal(0.015),
      costPerMonth = BigDecimal(10.0),
      billingDuration = BillingDuration(1, BillingTimeUnit.Month),
      trialPeriod = None,
      currency = Currency("EUR"),
      customName = None,
      customDescription = None,
      allowMultipleKeys = Some(false),
      autoRotation = None,
      subscriptionProcess = Seq.empty,
      integrationProcess = IntegrationProcess.Automatic,
      otoroshiTarget =
        if (linkToOtoroshi)
          Some(
            OtoroshiTarget(
              otoroshiSettings = OtoroshiSettingsId("default"),
              authorizedEntities = Some(AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))))) //FIXME: [#119]
          )
        else None
    ),
    PayPerUse(
      id = UsagePlanId(IdGenerator.token),
      tenant = tenantId,
      costPerMonth = BigDecimal(10.0),
      costPerRequest = BigDecimal(0.02),
      billingDuration = BillingDuration(1, BillingTimeUnit.Month),
      trialPeriod = None,
      currency = Currency("EUR"),
      customName = None,
      customDescription = None,
      allowMultipleKeys = Some(false),
      autoRotation = None,
      subscriptionProcess = Seq.empty,
      integrationProcess = IntegrationProcess.Automatic,
      otoroshiTarget =
        if (linkToOtoroshi)
          Some(
            OtoroshiTarget(
              otoroshiSettings = OtoroshiSettingsId("default"),
              authorizedEntities = Some(AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))))) //FIXME: [#119]
          )
        else None
    )
  )

  def SampleApi(id: String,
                tenant: TenantId,
                name: String,
                team: TeamId,
                docPages: Seq[ApiDocumentationDetailPage],
                visibility: ApiVisibility = ApiVisibility.Public) = {
    val plans = samplePlans(tenant)
    val api = Api(
      id = ApiId(IdGenerator.token(32)),
      tenant = tenant,
      team = team,
      deleted = false,
      name = s"$name - $id",
      lastUpdate = DateTime.now(),
      smallDescription =
        s"$name to Lorem ipsum dolor sit amet, consectetur adipiscing elit",
      tags = Set("api", "rest", "java", "fun"),
      description = s"""# $name - $id
           |
           |Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus.
           |
           |Nullam augue risus, aliquam eu tortor eget, congue finibus turpis. Sed elementum leo a viverra consequat. Pellentesque quis enim eget nulla scelerisque aliquam vel vitae purus. Donec hendrerit, ligula at lobortis volutpat, est arcu fringilla turpis, sit amet varius quam justo nec velit. Suspendisse potenti. Praesent bibendum lobortis auctor. Morbi pellentesque, elit sit amet pellentesque efficitur, nunc purus consequat arcu, id posuere ex lacus nec magna. Pellentesque id porta ex, vitae egestas erat. Ut dignissim nisi vel ex tincidunt, at ornare nisi pretium. Phasellus euismod pretium sagittis. Nunc suscipit luctus ante, quis finibus mauris luctus at. Morbi id erat porta, tincidunt felis in, convallis mi. Aliquam erat volutpat. Suspendisse iaculis elementum enim at consectetur. Donec consequat dapibus dictum. Integer viverra bibendum dolor et hendrerit.
           |
           |```js
           |class HelloMessage extends React.Component {
           |  render() {
           |    return (
           |      <div>
           |        Hello {this.props.name}
           |      </div>
           |    );
           |  }
           |}
           |
           |ReactDOM.render(
           |  <HelloMessage name="Taylor" />,
           |  mountNode
           |);
           |```
           |
           |Donec iaculis, ligula et malesuada pharetra, ex magna lacinia purus, quis feugiat ante ante faucibus mi. Sed ut nulla mattis ligula bibendum commodo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Duis sollicitudin maximus tempor. Sed a sagittis turpis. Aenean at elit pretium, porta neque ac, consectetur nisi. Pellentesque et justo ut nisl mollis tristique. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Vivamus lobortis tincidunt eros, at dapibus turpis tristique non. Proin rhoncus ut lacus nec pharetra. Nullam sit amet neque non nulla faucibus bibendum ac nec dui. Etiam nec nisi hendrerit, volutpat nibh nec, elementum diam. Integer vel lacinia nunc.
           |
           |Proin euismod metus ac consequat vestibulum. Nulla auctor euismod nunc, lacinia auctor augue posuere quis. Aenean nec arcu tellus. Sed quis felis dignissim, scelerisque nisi sed, volutpat arcu. Praesent eget risus suscipit, bibendum ante nec, dignissim libero. Sed eget dui vel lacus fringilla congue. Nulla vehicula tortor in venenatis dapibus. Nunc sed ante justo. Praesent eget ipsum tellus.
           |
           |Fusce ultricies at nisl sed faucibus. In sollicitudin libero eu augue lacinia aliquet. Nunc et eleifend augue. Donec eleifend nisi a iaculis tincidunt. Aenean a enim in nunc tincidunt euismod. Integer pellentesque tortor at ante tempus hendrerit. Fusce pretium, sapien ac sodales aliquam, diam quam placerat turpis, vitae tincidunt lacus massa finibus ante. Ut a ultrices odio. Sed pretium porttitor blandit. Sed ut ipsum a ligula pharetra lacinia. Donec laoreet purus mauris, rutrum hendrerit orci finibus at. Nullam aliquet augue ut tincidunt placerat. Proin tempor leo id orci tristique, at gravida metus pharetra.
      """.stripMargin,
      currentVersion = Version("1.0.0"),
      state = ApiState.Published,
      visibility = visibility,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(IdGenerator.token(32)),
        tenant = tenant,
        pages = docPages,
        lastModificationAt = DateTime.now()
      ),
      swagger = Some(SwaggerAccess("/assets/swaggers/petstore.json".some, None)),
      possibleUsagePlans = plans.map(_.id),
      defaultUsagePlan = plans.head.id
    )

    (api, plans)
  }

  def ToyApi(version: String,
             tenant: TenantId,
             teamId: TeamId,
             docPages: Seq[ApiDocumentationDetailPage],
             authorizedTeams: Seq[TeamId] = Seq.empty) = {
    val plans = samplePlans(tenant, linkToOtoroshi = true)
    val api = Api(
      id = ApiId(s"my-toy-api-${tenant.value}-$version"),
      tenant = tenant,
      team = teamId,
      lastUpdate = DateTime.now(),
      name = s"My Toy Api - V$version",
      smallDescription = "A small API to play with Daikoku exposition",
      tags = Set("api", "rest", "scala", "play"),
      description =
        """# My Awesome API
          |
          |Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus.
          |
          |Nullam augue risus, aliquam eu tortor eget, congue finibus turpis. Sed elementum leo a viverra consequat. Pellentesque quis enim eget nulla scelerisque aliquam vel vitae purus. Donec hendrerit, ligula at lobortis volutpat, est arcu fringilla turpis, sit amet varius quam justo nec velit. Suspendisse potenti. Praesent bibendum lobortis auctor. Morbi pellentesque, elit sit amet pellentesque efficitur, nunc purus consequat arcu, id posuere ex lacus nec magna. Pellentesque id porta ex, vitae egestas erat. Ut dignissim nisi vel ex tincidunt, at ornare nisi pretium. Phasellus euismod pretium sagittis. Nunc suscipit luctus ante, quis finibus mauris luctus at. Morbi id erat porta, tincidunt felis in, convallis mi. Aliquam erat volutpat. Suspendisse iaculis elementum enim at consectetur. Donec consequat dapibus dictum. Integer viverra bibendum dolor et hendrerit.
          |
          |```js
          |class HelloMessage extends React.Component {
          |  render() {
          |    return (
          |      <div>
          |        Hello {this.props.name}
          |      </div>
          |    );
          |  }
          |}
          |
          |ReactDOM.render(
          |  <HelloMessage name="Taylor" />,
          |  mountNode
          |);
          |```
          |
          |Donec iaculis, ligula et malesuada pharetra, ex magna lacinia purus, quis feugiat ante ante faucibus mi. Sed ut nulla mattis ligula bibendum commodo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Duis sollicitudin maximus tempor. Sed a sagittis turpis. Aenean at elit pretium, porta neque ac, consectetur nisi. Pellentesque et justo ut nisl mollis tristique. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Vivamus lobortis tincidunt eros, at dapibus turpis tristique non. Proin rhoncus ut lacus nec pharetra. Nullam sit amet neque non nulla faucibus bibendum ac nec dui. Etiam nec nisi hendrerit, volutpat nibh nec, elementum diam. Integer vel lacinia nunc.
          |
          |Proin euismod metus ac consequat vestibulum. Nulla auctor euismod nunc, lacinia auctor augue posuere quis. Aenean nec arcu tellus. Sed quis felis dignissim, scelerisque nisi sed, volutpat arcu. Praesent eget risus suscipit, bibendum ante nec, dignissim libero. Sed eget dui vel lacus fringilla congue. Nulla vehicula tortor in venenatis dapibus. Nunc sed ante justo. Praesent eget ipsum tellus.
          |
          |Fusce ultricies at nisl sed faucibus. In sollicitudin libero eu augue lacinia aliquet. Nunc et eleifend augue. Donec eleifend nisi a iaculis tincidunt. Aenean a enim in nunc tincidunt euismod. Integer pellentesque tortor at ante tempus hendrerit. Fusce pretium, sapien ac sodales aliquam, diam quam placerat turpis, vitae tincidunt lacus massa finibus ante. Ut a ultrices odio. Sed pretium porttitor blandit. Sed ut ipsum a ligula pharetra lacinia. Donec laoreet purus mauris, rutrum hendrerit orci finibus at. Nullam aliquet augue ut tincidunt placerat. Proin tempor leo id orci tristique, at gravida metus pharetra.
      """.stripMargin,
      currentVersion = Version("1.1.0"),
      supportedVersions = Set(Version("1.1.0"), Version("1.0.0")),
      state = ApiState.Published,
      visibility = ApiVisibility.Public,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(IdGenerator.token(32)),
        tenant = tenant,
        pages = docPages,
        lastModificationAt = DateTime.now(),
      ),
      swagger = Some(
        SwaggerAccess(url = "/assets/swaggers/petstore.json".some,
                      content = None)),
      possibleUsagePlans = plans.map(_.id),
      defaultUsagePlan = plans.head.id
    )

    (api, plans)
  }

  def createUserAndTeam(name: String,
                        email: String,
                        tenantId: TenantId,
                        admin: Boolean = true): (User, Team) = {
    val userId = UserId(IdGenerator.token)
    val userWithPermission =
      if (admin) UserWithPermission(userId, TeamUser)
      else UserWithPermission(userId, Administrator)

    val team = Team(
      id = TeamId(IdGenerator.token),
      tenant = tenantId,
      `type` = TeamType.Personal,
      name = s"$name",
      description = s"The personal team of $name",
      avatar = Some(
        s"https://www.gravatar.com/avatar/${email.md5}?size=128&d=robohash"),
      users = Set(userWithPermission),
      authorizedOtoroshiGroups = Set.empty,
      verified = true
    )
    val user = User(
      id = userId,
      tenants = Set(tenantId),
      origins = Set(AuthProvider.Local),
      name = name,
      email = email,
      isDaikokuAdmin = admin,
      picture = email.gravatar,
      password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
      lastTenant = None,
      personalToken = Some(IdGenerator.token(32)),
      defaultLanguage = None
      // lastTeams = Map.empty
    )
    (user, team)
  }

  def reset() = Action.async { ctx =>
    env.config.mode match {
      case DaikokuMode.Dev => resetDataStore()
      case _ =>
        FastFuture.successful(
          BadRequest(Json.obj("error" -> "Action not avalaible")))
    }
  }

  def resetDataStore() = {
    val team1Id = IdGenerator.token(32)
    val team2Id = IdGenerator.token(32)
    val team3Id = IdGenerator.token(32)
    val teamJohnnyId = IdGenerator.token(32)
    val tenantId = Tenant.Default
    val tenant2Id = TenantId("tenant-2")

    val (user1, userTeam1) =
      createUserAndTeam("Mathieu", "mathieu@foo.bar", tenantId)
    val (user2, userTeam2) =
      createUserAndTeam("Quentin", "quentin@foo.bar", tenantId)
    val (user3, userTeam3) =
      createUserAndTeam("Tester", "tester@foo.bar", tenantId)
    val (user4, userTeam4) =
      createUserAndTeam("philippe", "philippe@foo.bar", tenantId)
    val (user5, userTeam5) =
      createUserAndTeam("fifou", "fifou@foo.bar", tenantId, false)
    val (user6, userTeam6) =
      createUserAndTeam("Etienne", "etienne@foo.bar", tenantId, false)

    val issuesTags = Seq(
      ApiIssueTag(ApiIssueTagId(IdGenerator.token(32)),
                  "bug",
                  "#2980b9"),
      ApiIssueTag(ApiIssueTagId(IdGenerator.token(32)),
                  "backoffice",
                  "#c0392b"),
      ApiIssueTag(ApiIssueTagId(IdGenerator.token(32)),
                  "security",
                  "#8e44ad"),
      ApiIssueTag(ApiIssueTagId(IdGenerator.token(32)),
                  "subscription",
                  "#16a085"),
    )
    val issues: Seq[ApiIssue] = Seq(
      ApiIssue(
        id = ApiIssueId(IdGenerator.token(32)),
        seqId = 0,
        tenant = tenantId,
        title = "Daikoku Init on postgres can be broken",
        tags = Set(issuesTags.head.id),
        open = true,
        createdAt = DateTime.now(),
        lastModificationAt = DateTime.now(),
        closedAt = None,
        by = user1.id,
        comments = Seq(
          ApiIssueComment(
            by = user1.id,
            createdAt = DateTime.now(),
            lastModificationAt = DateTime.now(),
            content =
              "Describe the bug\nIf schema has some table, DK init can't be proceed & DK is broken\n\nExpected behavior\nInit detection & tables creation"
          )
        )
      ),
      ApiIssue(
        id = ApiIssueId(IdGenerator.token(32)),
        seqId = 1,
        tenant = tenantId,
        title = "2FA compatibility",
        tags = issuesTags.slice(1, issuesTags.size).map(_.id).toSet,
        open = false,
        createdAt = DateTime.now(),
        lastModificationAt = DateTime.now(),
        closedAt = None,
        by = user2.id,
        comments = Seq(
          ApiIssueComment(
            by = user2.id,
            createdAt = DateTime.now(),
            lastModificationAt = DateTime.now(),
            content =
              "Add a way to add 2FA for user account\n\nIt coud be great to use Authy, 1Password, or LastPass Authenticator."
          )
        )
      )
    )

    val defaultAdminTeam = Team(
      id = TeamId(IdGenerator.token),
      tenant = Tenant.Default,
      `type` = TeamType.Admin,
      name = s"default-admin-team",
      description = s"The admin team for the default tenant",
      avatar = Some(
        s"https://www.gravatar.com/avatar/${"default-tenant".md5}?size=128&d=robohash"),
      users = Set(
        UserWithPermission(user1.id, TeamPermission.Administrator),
        UserWithPermission(user2.id, TeamPermission.Administrator),
        UserWithPermission(user3.id, TeamPermission.Administrator),
        UserWithPermission(user4.id, TeamPermission.Administrator)
      ),
      authorizedOtoroshiGroups = Set.empty
    )
    val tenant2adminTeam = defaultAdminTeam.copy(
      id = TeamId(IdGenerator.token),
      tenant = tenant2Id,
      name = s"Johnny-be-good-admin-team",
      description = s"The admin team for the Johnny be good tenant",
      avatar = Some(
        s"https://www.gravatar.com/avatar/${"Johnny-be-good".md5}?size=128&d=robohash"),
    )

    val sender = user5

    val adminPlan = Admin(
      id = UsagePlanId("admin"),
      tenant = Tenant.Default,
      customName = Some("admin"),
      customDescription = None,
      otoroshiTarget = None
    )
    val adminApiDefaultTenant = Api(
      id = ApiId(s"admin-api-tenant-${Tenant.Default.value}"),
      tenant = Tenant.Default,
      team = defaultAdminTeam.id,
      name = s"admin-api-tenant-${Tenant.Default.value}",
      lastUpdate = DateTime.now(),
      smallDescription = "admin api",
      description = "admin api",
      currentVersion = Version("1.0.0"),
      state = ApiState.Published,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(IdGenerator.token(32)),
        tenant = Tenant.Default,
        pages = Seq.empty[ApiDocumentationDetailPage],
        lastModificationAt = DateTime.now()
      ),
      swagger = Some(SwaggerAccess(url = "/admin-api/swagger.json".some)),
      possibleUsagePlans = Seq(adminPlan.id),
      tags = Set("Administration"),
      visibility = ApiVisibility.AdminOnly,
      defaultUsagePlan = adminPlan.id,
      authorizedTeams = Seq.empty,
      issuesTags = issuesTags.toSet,
      issues = issues.map(_.id)
    )
    val adminPlanTenant2 = adminPlan.copy(tenant = tenant2Id)
    val adminApiTenant2 = adminApiDefaultTenant.copy(
      id = ApiId(s"admin-api-tenant-${tenant2Id.value}"),
      tenant = tenant2Id,
      name = s"admin-api-tenant-${tenant2Id.value}",
      team = tenant2adminTeam.id,
      tags = Set("Administration"),
      swagger = Some(SwaggerAccess(url = "/admin-api/swagger.json".some)),
      documentation = ApiDocumentation(
        id = ApiDocumentationId(IdGenerator.token(32)),
        tenant = tenant2Id,
        pages = Seq.empty[ApiDocumentationDetailPage],
        lastModificationAt = DateTime.now()
      ),
    )

    for {
      teamRepo1 <- env.dataStore.teamRepo.forTenantF(tenantId)
      teamRepo2 <- env.dataStore.teamRepo.forTenantF(tenant2Id)
      apiRepo <- env.dataStore.apiRepo.forTenantF(tenantId)
      apiRepo2 <- env.dataStore.apiRepo.forTenantF(tenant2Id)
      _ <- env.dataStore.tenantRepo.deleteAll()
      _ <- env.dataStore.userRepo.deleteAll()
      _ <- env.dataStore.auditTrailRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.userSessionRepo.deleteAll()
      _ <- env.dataStore.teamRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiSubscriptionRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiDocumentationPageRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.notificationRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.consumptionRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiPostRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiIssueRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.cmsRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.usagePlanRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.subscriptionDemandRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.messageRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.emailVerificationRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.tenantRepo.save(
        Tenant(
          id = Tenant.Default,
          name = "Evil Corp.",
          domain = "localhost",
          defaultLanguage = Some("En"),
          style = Some(
            DaikokuStyle(
              title = "Evil Corp."
            )),
          contact = "contact@foo.bar",
          mailerSettings = Some(ConsoleMailerSettings()),
          authProvider = AuthProvider.Local,
          authProviderSettings = Json.obj(
            "sessionMaxAge" -> 86400
          ),
          bucketSettings = None,
          otoroshiSettings = Set(
            OtoroshiSettings(
              id = OtoroshiSettingsId("default"),
              url = s"http://127.0.0.1:${env.config.port}/fakeotoroshi",
              host = "otoroshi-api.foo.bar",
              clientId = "admin-api-apikey-id",
              clientSecret = "admin-api-apikey-id"
            )
          ),
          adminApi = adminApiDefaultTenant.id
        )
      )
      _ <- env.dataStore.tenantRepo.save(
        Tenant(
          id = tenant2Id,
          name = "Johnny be good",
          domain = "localhost",
          defaultLanguage = Some("fr"),
          contact = "contact@foo.bar",
          style = Some(
            DaikokuStyle(
              title = "North American Johnny Look Alike Association",
              description = "On a tous en nous quelque chose de Johnny",
              logo = "https://i.ytimg.com/vi/a2DMlY8f1IE/hqdefault.jpg",
              js = """<script>
                |  console.log('Allumez le feu !!!')
                |</script>
              """.stripMargin,
              css = """body {
              |}
              |
              |.user-logo {
              |  background-color: white;
              |}
              |
              |a {
              |  color: #111;
              |}
              |
              |button {
              |  background-color: #fff;
              |}
              |
              |a:hover, .btn:hover, .btn:focus {
              |  color: #111;
              |}
              |
              |.modal-content .btn:hover, .modal-content .btn:focus {
              |  color: #fff;
              |}
              |
              |main {
              |  background-color: #fff;
              |}
              |
              |main .jumbotron {
              |  background-color: #fff;
              |}
              |
              |.btn-outline-primary:hover, .btn-outline-danger:hover, .btn-outline-success:hover {
              |  color: #fff;
              |}
              |
              |/* btns */
              |.btn-access {
              |  color: #fff;
              |  background-color: #333;
              |  border-color: #333;
              |}
              |
              |.btn-access:hover {
              |  color: #fff;
              |  background-color: #111;
              |}
              |
              |.btn-access-negative {
              |  color: #495057;
              |  border-color: #333;
              |  background-color: #fff;
              |}
              |
              |/* cards */
              |.card-header {
              |  color: #eceeef;
              |}
              |
              |.cardAble .card-header {
              |  background-color: #666;
              |}
              |
              |.cardDisable .card-header {
              |  background-color: #555;
              |}
              |
              |.cardDisable a:hover, .cardAble a:hover {
              |  color: #6c757d;
              |}
              |
              |.cardDisable a, .cardAble a {
              |  color: #6c757d;
              |}
              |
              |.card-skin {
              |  color: rgb(32, 37, 41);
              |  background-color: rgb(231, 236, 239);
              |}
              |
              |a.nav-link.active {
              |  background-color: rgb(233, 236, 239);
              |}
              |
              |.doc-title {
              |  color: #343a40;
              |}
              |
              |.doc-title>a:hover, .doc-title>a:visited, .doc-title>a:link, .doc-title>a:active {
              |  color: #343a40;
              |}
              |
              |.home-tiles>a:hover, .home-tiles>a:visited, .home-tiles>a:link, .home-tiles>a:active {
              |  color: #343a40;
              |}
              |
              |.home-tile{
              |  background-color: #ccc;
              |}
              |
              |.sidebar .nav-link {
              |  color: #333;
              |}
              |
              |.sidebar .nav-link svg {
              |  color: #999;
              |}
              |
              |.sidebar .nav-link.active {
              |  color: #555;
              |}
              |
              |a.navbar-brand, #teamSelector:hover {
              |  color: #fff;
              |}
              |
              |.album, .navbar {
              |  background-color: #111;
              |}
              |
              |.sidebar .nav-link.active .nav-icon {
              |  fill: #555;
              |}
              |
              |.dropdown-menu {
              |  background-color: #f8f9fa;
              |}
              |
              |.dropdown-item:hover {
              |  background-color: #9bb0c5;
              |  color: #fff
              |}
              |
              |.note {
              |  border-left: 10px solid #555;
              |  background-color: rgba(64, 120, 192, 0.1);
              |  color: #0a0a0a;
              |}
              |
              |.note-warning {
              |  border-color: #DB504A;
              |  background-color: #fff3d9;
              |}
              |
              |/* notification */
              |.notification-link {
              |  color: #6c757d;
              |}
              |
              |.notification-link:hover {
              |  color: #5a6268;
              |}
              |
              |.unread-notifications::before {
              |  background-color: tomato;
              |  border: 2px solid #111;
              |}
              |
              |.notification-prop a:hover {
              |  color: #fff;
              |}
              |
              |.bg-api-detail {
              |  background-color: #e9ecef;
              |}
              |
              |.navDocumentation li::before {
              |  color: #6c757d;
              |}
              |
              |.hr-apidescription {
              |  border-bottom: 1px solid #BBBBBB;
              |}
              |
              |/* modal */
              |.modal-header{
              |  background-color: #111;
              |}
              |.modal-body,.modal-footer{
              |  background-color: #333;
              |}
              |.modal-content{
              |  background-color: initial;
              |  color:#fff;
              |}
              |
              |.table-plan-name .planSelected {
              |  background-color: #343a40;
              |  color:#fff;
              |}
              |
              |/* rwd */
              |@media screen and (max-width: 540px) {
              |  .nav-tabs .nav-item {
              |    border: 1px solid #555;
              |  }
              |  .nav-tabs .nav-link.active, .nav-tabs .nav-item.show .nav-link {
              |    background-color: #e7ecef;
              |  }
              |}
            """.stripMargin
            )),
          mailerSettings = Some(ConsoleMailerSettings()),
          authProvider = AuthProvider.Local,
          authProviderSettings = Json.obj(
            "sessionMaxAge" -> 86400
          ),
          bucketSettings = None,
          otoroshiSettings = Set(
            OtoroshiSettings(
              id = OtoroshiSettingsId("default"),
              url = s"http://127.0.0.1:${env.config.port}/fakeotoroshi",
              host = "otoroshi-api.foo.bar",
              clientId = "admin-api-apikey-id",
              clientSecret = "admin-api-apikey-id"
            )
          ),
          adminApi = adminApiTenant2.id
        )
      )
      _ <- env.dataStore.apiRepo
        .forTenant(Tenant.Default)
        .save(adminApiDefaultTenant)
      _ <- env.dataStore.usagePlanRepo.forTenant(Tenant.Default).save(adminPlan)
      _ <- env.dataStore.apiRepo.forTenant(tenant2Id).save(adminApiTenant2)
      _ <- env.dataStore.usagePlanRepo
        .forTenant(tenant2Id)
        .save(adminPlanTenant2)
      _ <- teamRepo1.save(
        Team(
          id = TeamId(team3Id),
          tenant = tenantId,
          `type` = TeamType.Organization,
          name = s"Opun Team",
          description = s"The team for Opun people",
          avatar = Some(
            s"https://www.gravatar.com/avatar/${"opun-team@otoroshi.io".md5}?size=128&d=robohash"),
          users = Set(
            UserWithPermission(user1.id, TeamUser),
            UserWithPermission(user2.id, TeamUser),
            UserWithPermission(user3.id, TeamUser),
            UserWithPermission(user4.id, TeamUser),
            UserWithPermission(user5.id, Administrator)
          )
        )
      )
      _ <- teamRepo1.save(
        Team(
          id = TeamId(team1Id),
          tenant = tenantId,
          `type` = TeamType.Organization,
          name = s"Fifou's Team",
          description = s"The team for Fifou people",
          avatar = Some(
            s"https://www.gravatar.com/avatar/${"fifou-team@otoroshi.io".md5}?size=128&d=robohash"),
          users = Set(
            UserWithPermission(user1.id, Administrator),
            UserWithPermission(user2.id, Administrator),
            UserWithPermission(user3.id, Administrator),
            UserWithPermission(user4.id, Administrator),
            UserWithPermission(user5.id, ApiEditor)
          )
        )
      )
      _ <- teamRepo1.save(
        Team(
          id = TeamId(team2Id),
          tenant = tenantId,
          `type` = TeamType.Organization,
          name = s"Bobby's Team",
          description = s"The team for Bobby people",
          avatar = Some(
            s"https://www.gravatar.com/avatar/${"bobby-team@otoroshi.io".md5}?size=128&d=robohash"),
          users = Set(UserWithPermission(user5.id, Administrator))
        )
      )
      _ <- teamRepo2.save(
        Team(
          id = TeamId(teamJohnnyId),
          tenant = tenant2Id,
          `type` = TeamType.Organization,
          name = s"Johnny's Team",
          description = s"The team for Johnny's fans",
          avatar = Some(
            s"https://www.gravatar.com/avatar/${"johnny-team@otoroshi.io".md5}?size=128&d=robohash"),
          users = Set.empty
        )
      )
      _ <- env.dataStore.userRepo.save(user1)
      _ <- env.dataStore.userRepo.save(user2)
      _ <- env.dataStore.userRepo.save(user3)
      _ <- env.dataStore.userRepo.save(user4)
      _ <- env.dataStore.userRepo.save(user5)
      _ <- env.dataStore.userRepo.save(user6)
      _ <- teamRepo1.save(userTeam1)
      _ <- teamRepo1.save(userTeam2)
      _ <- teamRepo1.save(userTeam3)
      _ <- teamRepo1.save(userTeam4)
      _ <- teamRepo1.save(userTeam5)
      _ <- teamRepo1.save(userTeam6)
      _ <- teamRepo1.save(defaultAdminTeam)
      _ <- teamRepo1.save(tenant2adminTeam)
      ids <- saveApiDocPages(tenantId)
      ids2 <- saveApiDocPages(tenant2Id)

      toyApiDefault = ToyApi("0",
                             tenantId,
                             TeamId(team1Id),
                             ids,
                             Seq(TeamId(team3Id)))
      toyApiJohnny = ToyApi("0", tenant2Id, TeamId(teamJohnnyId), ids2)
      sampleApi = SampleApi("1",
                            tenantId,
                            "Sample Api",
                            TeamId(team2Id),
                            ids,
                            ApiVisibility.PublicWithAuthorizations)

      _ <- Future.sequence(
        Seq(
          apiRepo.save(toyApiDefault._1),
          apiRepo2.save(toyApiJohnny._1),
          apiRepo.save(sampleApi._1),
        )
      )
      _ <- env.dataStore.usagePlanRepo
        .forTenant(Tenant.Default)
        .insertMany(toyApiDefault._2 ++ sampleApi._2)
      _ <- env.dataStore.usagePlanRepo
        .forTenant(tenant2Id)
        .insertMany(toyApiJohnny._2)

      _ <- Future.sequence(issues.map(issue =>
        env.dataStore.apiIssueRepo.forTenant(tenantId).save(issue)))
    } yield {
      Ok(Json.obj("done" -> true))
    }
  }

  // client(s"/api/groups/$groupId")
  // client(s"/api/groups").get()
  // client(s"/api/groups/$groupId").get()
  // client(s"/api/groups/$groupId/apikeys/$clientId").get()
  // client(s"/api/groups/$groupId/apikeys").post
  // client(s"/api/groups/$groupId/apikeys/${key.clientId}").put
  // client(s"/api/groups/$groupId/apikeys/$clientId").delete().

  val groups: Seq[JsObject] = Seq(
    Json.obj(
      "id" -> "12345",
      "name" -> "nice-group",
      "description" -> "A nice group"
    ),
    Json.obj(
      "id" -> "12346",
      "name" -> "daikoku_nice-group",
      "description" -> "A nice group (with prefix)"
    )
  )
  val services: Seq[JsObject] = Seq(
    Json.obj(
      "id" -> "s_12345",
      "name" -> "nice-service",
      "description" -> "A nice servcie"
    ),
    Json.obj(
      "id" -> "s_12346",
      "name" -> "daikoku_nice-service",
      "description" -> "A nice service (with prefix)"
    )
  )
  val routes: Seq[JsObject] = Seq(
    Json.obj(
      "id" -> "r_12345",
      "name" -> "nice-route",
      "description" -> "A nice route"
    ),
    Json.obj(
      "id" -> "r_12346",
      "name" -> "daikoku_nice-route",
      "description" -> "A nice route (with prefix)"
    )
  )
  var apikeys: Seq[JsObject] = Seq()

  def fakeOtoroshiGroups() = Action {
    Ok(JsArray(groups))
  }
  def fakeOtoroshiServices() = Action {
    Ok(JsArray(services))
  }
  def fakeOtoroshiRoutes() = Action {
    Ok(JsArray(routes))
  }

  def fakeOtoroshiGroup(groupId: String) = Action {
    val found = groups.find { obj =>
      (obj \ "id").as[String] == groupId
    }
    found match {
      case Some(group) => Ok(group)
      case None        => NotFound(Json.obj("error" -> "not found"))
    }
  }

  def fakeOtoroshiApiKeys() = Action {
    Ok(JsArray(apikeys))
  }

  def fakeOtoroshiApiKey(clientId: String) = Action.async {
    env.dataStore.apiSubscriptionRepo
      .forAllTenant()
      .findOne(Json.obj("apiKey.clientId" -> clientId))
      .map {
        case Some(subscription) =>
          Ok(
            ActualOtoroshiApiKey(
              clientId = clientId,
              clientSecret = subscription.apiKey.clientSecret,
              clientName = subscription.apiKey.clientName,
              authorizedEntities = AuthorizedEntities(),
              throttlingQuota = 10,
              dailyQuota = 10000,
              monthlyQuota = 300000,
              constrainedServicesOnly = true,
              restrictions = ApiKeyRestrictions(),
              metadata = Map(),
              rotation = None
            ).asJson)
        case _ => BadRequest(Json.obj("error" -> "Subscription not found"))
      }
  }

  def createFakeOtoroshiApiKey() = Action(parse.json) { req =>
    apikeys = apikeys :+ req.body.as[JsObject]
    Ok(req.body.as[JsObject])
  }

  def updateFakeOtoroshiApiKey(clientId: String) =
    Action(parse.json) { req =>
      json.ActualOtoroshiApiKeyFormat.reads(req.body).asOpt match {
        case Some(apiKey) => Ok(apiKey.asJson)
        case None         => BadRequest(Json.obj("error" -> "wrong apikey format"))
      }
    }

  def deleteFakeOtoroshiApiKey(clientId: String) =
    Action(parse.json) {
      Ok(Json.obj("deleted" -> true))
    }

  def fakeOtoroshiStats(from: String, to: String, apikey: String) =
    Action.async {
      val r = scala.util.Random

      env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findOneNotDeleted(Json.obj("apiKey.clientId" -> apikey))
        .flatMap {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "subscription not found")))
          case Some(sub) =>
            env.dataStore.apiRepo
              .forAllTenant()
              .findByIdNotDeleted(sub.api)
              .map {
                case None => NotFound(Json.obj("error" -> "api not found"))
                case Some(api) =>
                  Ok(Json.obj("hits" -> Json.obj("count" -> r.nextInt(100))))
              }
        }
    }

  def fakeOtoroshiQuotas(clientId: String) = Action.async {
    val r = scala.util.Random

    env.dataStore.apiSubscriptionRepo
      .forAllTenant()
      .findOneNotDeleted(Json.obj("apiKey.clientId" -> clientId))
      .flatMap {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "subscription not found")))
        case Some(sub) =>
          env.dataStore.usagePlanRepo
            .forAllTenant()
            .findOneNotDeleted(Json.obj("_id" -> sub.plan.asJson))
            .map {
              case None => NotFound(Json.obj("error" -> "plan not found"))
              case Some(pp) =>
                val callPerSec =
                  r.nextInt(pp.maxRequestPerSecond.getOrElse(10L).toInt)
                val callPerDay =
                  r.nextInt(pp.maxRequestPerDay.getOrElse(100L).toInt)
                val callPerMonth =
                  r.nextInt(pp.maxRequestPerMonth.getOrElse(1000L).toInt)

                Ok(ApiKeyQuotas(
                  authorizedCallsPerSec = pp.maxRequestPerSecond.getOrElse(0),
                  currentCallsPerSec = callPerSec,
                  remainingCallsPerSec = pp.maxRequestPerSecond
                    .getOrElse(0L) - callPerSec,
                  authorizedCallsPerDay = pp.maxRequestPerDay.getOrElse(0),
                  currentCallsPerDay = callPerDay,
                  remainingCallsPerDay = pp.maxRequestPerDay
                    .getOrElse(0L) - callPerDay,
                  authorizedCallsPerMonth = pp.maxRequestPerMonth.getOrElse(0),
                  currentCallsPerMonth = callPerMonth,
                  remainingCallsPerMonth = pp.maxRequestPerMonth
                    .getOrElse(0L) - callPerMonth,
                ).asJson)
            }
      }
  }
}
