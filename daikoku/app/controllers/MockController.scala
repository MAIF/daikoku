package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import org.apache.pekko.http.scaladsl.util.FastFuture
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.domain.TeamPermission._
import fr.maif.otoroshi.daikoku.domain.UsagePlan._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.AuthorizedEntitiesOtoroshiFormat
import fr.maif.otoroshi.daikoku.env.{DaikokuMode, Env}
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import org.apache.pekko.Done
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json._
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class MockController(
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

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
      tenant: TenantId
  ): Future[Seq[ApiDocumentationDetailPage]] = {
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
        ApiDocumentationDetailPage(
          id = id1,
          title = "Introduction",
          children = Seq.empty
        ),
        ApiDocumentationDetailPage(
          id = id2,
          title = "Do This",
          children = Seq(
            ApiDocumentationDetailPage(
              id = id1,
              title = "and do it well",
              children = Seq.empty
            )
          )
        ),
        ApiDocumentationDetailPage(
          id = id3,
          title = "Do That ",
          children = Seq.empty
        ),
        ApiDocumentationDetailPage(
          id = id4,
          title = "FAQ",
          children = Seq.empty
        )
      )
    }
  }

  def samplePlans(tenantId: TenantId, linkToOtoroshi: Boolean = false) =
    Seq(
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
                authorizedEntities = Some(
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId("12345"))
                  )
                )
              ) //FIXME: [#119]
            )
          else None
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
                authorizedEntities = Some(
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId("12345"))
                  )
                )
              ) //FIXME: [#119]
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
                authorizedEntities = Some(
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId("12345"))
                  )
                )
              ) //FIXME: [#119]
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
                authorizedEntities = Some(
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId("12345"))
                  )
                )
              ) //FIXME: [#119]
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
                authorizedEntities = Some(
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId("12345"))
                  )
                )
              ) //FIXME: [#119]
            )
          else None
      )
    )

  def SampleApi(
      id: String,
      tenant: TenantId,
      name: String,
      team: TeamId,
      docPages: Seq[ApiDocumentationDetailPage],
      visibility: ApiVisibility = ApiVisibility.Public
  ) = {
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
      swagger =
        Some(SwaggerAccess("/assets/swaggers/petstore.json".some, None)),
      possibleUsagePlans = plans.map(_.id),
      defaultUsagePlan = plans.head.id.some
    )

    (api, plans)
  }

  def ToyApi(
      version: String,
      tenant: TenantId,
      teamId: TeamId,
      docPages: Seq[ApiDocumentationDetailPage],
      authorizedTeams: Seq[TeamId] = Seq.empty
  ) = {
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
        lastModificationAt = DateTime.now()
      ),
      swagger = Some(
        SwaggerAccess(
          url = "/assets/swaggers/petstore.json".some,
          content = None
        )
      ),
      possibleUsagePlans = plans.map(_.id),
      defaultUsagePlan = plans.head.id.some
    )

    (api, plans)
  }

  def createUserAndTeam(
      name: String,
      email: String,
      tenantId: TenantId,
      admin: Boolean = true
  ): (User, Team) = {
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
        s"https://www.gravatar.com/avatar/${email.md5}?size=128&d=robohash"
      ),
      users = Set(userWithPermission),
      authorizedOtoroshiEntities = None,
      verified = true,
      contact = email
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

  def reset() =
    Action.async { _ =>
      (for {
        _ <- EitherT.cond[Future][AppError, Unit](
          env.config.isDev,
          (),
          AppError.SecurityError("Action not avalaible")
        )
        _ <- EitherT.liftF[Future, AppError, Unit](env.dataStore.clear())
        _ <- EitherT.liftF[Future, AppError, Done](env.initDatastore())
      } yield Redirect("/?message=password.reset.successfull"))
        .leftMap(_.render())
        .merge
    }

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

  def fakeOtoroshiGroups() =
    Action {
      Ok(JsArray(groups))
    }
  def fakeOtoroshiServices() =
    Action {
      Ok(JsArray(services))
    }
  def fakeOtoroshiRoutes() =
    Action {
      Ok(JsArray(routes))
    }

  def fakeOtoroshiGroup(groupId: String) =
    Action {
      val found = groups.find { obj =>
        (obj \ "id").as[String] == groupId
      }
      found match {
        case Some(group) => Ok(group)
        case None        => NotFound(Json.obj("error" -> "not found"))
      }
    }

  def fakeOtoroshiApiKeys() =
    Action {
      Ok(JsArray(apikeys))
    }

  def fakeOtoroshiApiKey(clientId: String) =
    Action.async {
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
              ).asJson
            )
          case _ => BadRequest(Json.obj("error" -> "Subscription not found"))
        }
    }

  def createFakeOtoroshiApiKey() =
    Action(parse.json) { req =>
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
              NotFound(Json.obj("error" -> "subscription not found"))
            )
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

  def fakeOtoroshiQuotas(clientId: String) =
    Action.async {
      val r = scala.util.Random

      env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findOneNotDeleted(Json.obj("apiKey.clientId" -> clientId))
        .flatMap {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "subscription not found"))
            )
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

                  Ok(
                    ApiKeyQuotas(
                      authorizedCallsPerSec =
                        pp.maxRequestPerSecond.getOrElse(0),
                      currentCallsPerSec = callPerSec,
                      remainingCallsPerSec = pp.maxRequestPerSecond
                        .getOrElse(0L) - callPerSec,
                      authorizedCallsPerDay = pp.maxRequestPerDay.getOrElse(0),
                      currentCallsPerDay = callPerDay,
                      remainingCallsPerDay = pp.maxRequestPerDay
                        .getOrElse(0L) - callPerDay,
                      authorizedCallsPerMonth =
                        pp.maxRequestPerMonth.getOrElse(0),
                      currentCallsPerMonth = callPerMonth,
                      remainingCallsPerMonth = pp.maxRequestPerMonth
                        .getOrElse(0L) - callPerMonth
                    ).asJson
                  )
              }
        }
    }
}
