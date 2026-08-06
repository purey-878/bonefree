import { ASSETS } from "../constants/assets";

const WelcomeSection = () => {
  return (
    <section className="welcome container section-mt">
      <div className="container">
        <div className="row align-items-center py-5">

          {/* Text column */}
          <div
            className="col-lg-7 col-md-12 mb-4 mb-lg-0"
            data-aos="fade-right"
            data-aos-duration="300"
            data-aos-delay="100"
          >
            <div className="d-flex align-items-center mb-2">
              <h4 className="fs-5 fs-md-4 text-uppercase mb-0 green">
                Vegano, delicioso e com boa energia.

              </h4>
              <i className="bi bi-leaf-fill fs-4 ms-2 text-success"></i>
            </div>

            <h1 className="display-4 display-md-1 fw-normal mb-3">
              Bonefree Sabores Veganos na Costa da Caparica
            </h1>

            <h6 className="lh-lg mb-4 text-muted">
             Bem-vindo ao Bonefree, um restaurante e bar vegan na Costa da Caparica. Aqui encontras nachos latinos, hambúrgueres vegan e pratos criativos à base de plantas, acompanhados por cocktails refrescantes, num ambiente descontraído.
            </h6>

            <h4 className="fw-semi-bold fs-4 green">
              Google Reviews
            </h4>
            <p className="text-muted">
              ⭐ 4.8 / 5 - 1,200 avaliações
            </p>
          </div>

          {/* Image column */}
          <div
            className="col-lg-5 col-md-12 text-center text-lg-end"
            data-aos="fade-left"
            data-aos-duration="300"
            data-aos-delay="100"
          >
            <picture>
              <source
                srcSet={ASSETS.images.hero.burgerGirl}
                type="image/webp"
              />
              <img
                src={ASSETS.images.hero.burgerGirl.replace('.webp', '.jpg')}
                className="img-fluid rounded"
                alt="Happy customer enjoying a burger"
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>

        </div>
      </div>
    </section>
  );
};

export default WelcomeSection;
