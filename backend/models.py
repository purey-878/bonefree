from sqlalchemy import Boolean, Column, Integer, Numeric, String, Text, ForeignKey, Date, DateTime, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
from utils.id_format import format_category_id, format_product_id


class Admin(Base):
    __tablename__ = 'admin'

    id_admin = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nome = Column(String(100), nullable=False)
    email = Column(String(150), nullable=False, unique=True, index=True)
    palavra_passe = Column(String(255), nullable=False)
    data_criacao = Column(Date, nullable=True)
    status = Column(Integer, default=1, nullable=True)
    role = Column(String(30), default='staff_admin', nullable=False)


class Categoria(Base):
    __tablename__ = 'categoria'

    id_categoria = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nome_categoria = Column(String(100), nullable=False)
    descricao_categoria = Column(String(255), nullable=True)
    id_admin = Column(Integer, ForeignKey('admin.id_admin'), nullable=False, index=True)
    status = Column(Integer, nullable=True)

    admin = relationship('Admin')

    @property
    def id_categoria_display(self) -> str:
        return format_category_id(self.id_categoria)


class SiteSetting(Base):
    __tablename__ = 'site_setting'

    chave = Column(String(100), primary_key=True, index=True)
    valor = Column(Text, nullable=True)
    data_atualizacao = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)


class EmpresaConfig(Base):
    __tablename__ = 'empresa_config'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nome_empresa = Column(String(150), nullable=False)
    nif_empresa = Column(String(20), nullable=False)
    morada = Column(String(255), nullable=True)
    codigo_postal = Column(String(20), nullable=True)
    cidade = Column(String(100), nullable=True)
    pais = Column(String(100), nullable=False, default="Portugal", server_default="Portugal")
    email = Column(String(150), nullable=True)
    telefone = Column(String(30), nullable=True)
    data_atualizacao = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Produto(Base):
    __tablename__ = 'produto'

    id_produto = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nome = Column(String(150), nullable=False)
    descricao_produto = Column(String(255), nullable=True)
    preco = Column(Numeric(10, 2), nullable=False)
    stock = Column(Integer, nullable=False)
    id_categoria = Column(Integer, ForeignKey('categoria.id_categoria'), nullable=False)
    id_admin = Column(Integer, ForeignKey('admin.id_admin'), nullable=False, index=True)
    vendido = Column(Integer, nullable=True)
    imagem = Column(String(255), nullable=True)
    status = Column(Integer, nullable=True)
    customizavel = Column(Boolean, nullable=False, default=True, server_default="1")
    menu_tags = Column(String(255), nullable=True)
    destaque = Column(Boolean, nullable=False, default=False, server_default="0")
    desconto_percentual = Column(Numeric(5, 2), nullable=False, default=0)
    gluten_free = Column(Boolean, nullable=False, default=False, server_default="0")
    contains_alcohol = Column(Boolean, nullable=False, default=False, server_default="0")
    deleted_at = Column(DateTime, nullable=True, index=True)  #  soft delete

    admin = relationship('Admin')
    categoria = relationship('Categoria', lazy='joined')
    # Parent-side 0..N: a product may exist without any uploaded images.
    imagens = relationship('ImagemProduto', back_populates='produto', lazy='joined')
    # Parent-side 0..N: a product may exist without any customer reviews.
    reviews = relationship("ProdutoReview", back_populates="produto")

    total_calorias = Column(Numeric(10, 2), nullable=True)

    @property
    def id_produto_display(self) -> str:
        return format_product_id(self.id_produto)

    @property
    def id_categoria_display(self) -> str:
        return format_category_id(self.id_categoria)


class ImagemProduto(Base):
    __tablename__ = 'imagem_produto'

    id_imagem = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_produto = Column(Integer, ForeignKey('produto.id_produto'), nullable=False)
    caminho_imagem = Column(String(255), nullable=False)

    produto = relationship("Produto", back_populates="imagens")


class Cliente(Base):
    __tablename__ = 'cliente'

    id_cliente = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nome = Column(String(100), nullable=True)
    apelido = Column(String(100), nullable=True)
    nif = Column(String(20), nullable=True, unique=True)
    telefone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=False, unique=True, index=True)
    palavra_passe = Column(String(255), nullable=False)
    password_reset_code_hash = Column(String(255), nullable=True)
    password_reset_expires_at = Column(DateTime, nullable=True)
    password_reset_attempts = Column(Integer, default=0, nullable=True)
    password_reset_verified_until = Column(DateTime, nullable=True)
    password_reset_token_hash = Column(String(255), nullable=True)
    status = Column(Integer, default=1, nullable=True)
    data_criacao = Column(DateTime, default=datetime.utcnow, nullable=True)

    endereco_fatura = relationship("ClienteEnderecoFatura", back_populates="cliente", uselist=False, cascade="all, delete-orphan")
    carrinho = relationship("Carrinho", back_populates="cliente", uselist=False)
    reviews = relationship("ProdutoReview", back_populates="cliente")
    # Parent-side 0..N: a client may exist without any coupons.
    cupons = relationship("Cupom", back_populates="cliente")


class ClienteEnderecoFatura(Base):
    __tablename__ = 'cliente_endereco_fatura'

    id_endereco = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cliente_id = Column(Integer, ForeignKey('cliente.id_cliente', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    morada = Column(String(255), nullable=True)
    codigo_postal = Column(String(20), nullable=True)
    cidade = Column(String(100), nullable=True)
    pais = Column(String(100), nullable=False, default="Portugal", server_default="Portugal")

    cliente = relationship("Cliente", back_populates="endereco_fatura")


class ClienteLoyalty(Base):
    __tablename__ = 'cliente_loyalty'

    id_cliente = Column(Integer, ForeignKey('cliente.id_cliente'), primary_key=True, nullable=False)
    pedidos_acima_50 = Column(Integer, nullable=False, default=0)
    total_cupons_ganhos = Column(Integer, nullable=False, default=0)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    cliente = relationship("Cliente")


class Cupom(Base):
    __tablename__ = 'cupom'

    id_cupom = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_cliente = Column(Integer, ForeignKey('cliente.id_cliente'), nullable=False)
    codigo = Column(String(50), nullable=False, unique=True, index=True)
    tipo = Column(Enum('VALOR_FIXO', 'PERCENTAGEM'), default='VALOR_FIXO', nullable=False)
    valor = Column(Numeric(10, 2), nullable=False, default=20)
    valor_minimo_pedido = Column(Numeric(10, 2), nullable=False, default=0)
    usado = Column(Boolean, nullable=False, default=False, server_default="0")
    usado_em = Column(DateTime, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow, nullable=False)
    expira_em = Column(DateTime, nullable=True)

    cliente = relationship("Cliente", back_populates="cupons")


class Carrinho(Base):
    __tablename__ = 'carrinho'

    id_carrinho = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_cliente = Column(Integer, ForeignKey('cliente.id_cliente', ondelete='CASCADE'), nullable=False)
    data_criacao = Column(Date, default=datetime.utcnow)

    cliente = relationship("Cliente", back_populates="carrinho")
    itens = relationship("CarrinhoProduto", back_populates="carrinho", cascade="all, delete-orphan")


class CarrinhoProduto(Base):
    __tablename__ = 'carrinho_produto'

    cart_log_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_carrinho = Column(Integer, ForeignKey('carrinho.id_carrinho', ondelete='CASCADE'), nullable=False)
    id_produto = Column(Integer, ForeignKey('produto.id_produto'), nullable=False)
    quantidade = Column(Integer, nullable=False, default=1)
    customizacao = Column(String(1000), nullable=True)

    carrinho = relationship("Carrinho", back_populates="itens")
    produto = relationship("Produto", lazy='joined')
    customizacoes = relationship("CarrinhoProdutoCustomizacao", back_populates="item", cascade="all, delete-orphan")


class Ingrediente(Base):
    __tablename__ = 'ingrediente'

    id_ingrediente = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nome = Column(String(120), nullable=False, unique=True)
    tipo = Column(Enum('INGREDIENTES_NORMAIS', 'MOLHO', 'EXTRA', 'BEBIDA', 'BASE', 'ACOMPANHAMENTO'), default='INGREDIENTES_NORMAIS', nullable=False)
    status = Column(Integer, nullable=False, default=1)
    calorias_por_grama = Column(Numeric(8, 4), nullable=True)



class ProdutoIngrediente(Base):
    __tablename__ = 'produto_ingrediente'

    id_produto = Column(Integer, ForeignKey('produto.id_produto'), primary_key=True, nullable=False)
    id_ingrediente = Column(Integer, ForeignKey('ingrediente.id_ingrediente'), primary_key=True, nullable=False)
    incluido_por_defeito = Column(Boolean, nullable=False, default=True, server_default="1")
    removivel = Column(Boolean, nullable=False, default=True, server_default="1")
    substituivel = Column(Boolean, nullable=False, default=False, server_default="0")
    quantidade = Column(String(50), nullable=True)

    produto = relationship("Produto")
    ingrediente = relationship("Ingrediente", lazy='joined')


class ProdutoOpcaoCustomizacao(Base):
    __tablename__ = 'produto_opcao_customizacao'

    id_opcao = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_produto = Column(Integer, ForeignKey('produto.id_produto'), nullable=False)
    id_ingrediente = Column(Integer, ForeignKey('ingrediente.id_ingrediente'), nullable=True)
    nome = Column(String(150), nullable=False)
    tipo = Column(Enum('ADICIONAR', 'REMOVER', 'EXTRA', 'SUBSTITUIR_MOLHO'), nullable=False)
    preco_extra = Column(Numeric(10, 2), nullable=False, default=0)
    max_quantidade = Column(Integer, nullable=False, default=1)
    status = Column(Integer, nullable=False, default=1)

    produto = relationship("Produto")
    ingrediente = relationship("Ingrediente", lazy='joined')
    # Parent-side 0..N: an option may exist without being selected in a cart.
    cart_customizacoes = relationship("CarrinhoProdutoCustomizacao", back_populates="opcao")


class CarrinhoProdutoCustomizacao(Base):
    __tablename__ = 'carrinho_produto_customizacao'

    id_customizacao = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cart_log_id = Column(Integer, ForeignKey('carrinho_produto.cart_log_id', ondelete='CASCADE'), nullable=False)
    id_ingrediente = Column(Integer, ForeignKey('ingrediente.id_ingrediente', ondelete='SET NULL'), nullable=True)
    id_opcao = Column(Integer, ForeignKey('produto_opcao_customizacao.id_opcao', ondelete='SET NULL'), nullable=True)
    acao = Column(Enum('REMOVER_INGREDIENTE', 'ADICIONAR_EXTRA', 'SUBSTITUIR_MOLHO', 'SUBSTITUIR_ACOMPANHAMENTO'), nullable=False)
    quantidade = Column(Integer, nullable=False, default=1)
    preco_extra = Column(Numeric(10, 2), nullable=False, default=0)
    notas = Column(String(255), nullable=True)

    item = relationship("CarrinhoProduto", back_populates="customizacoes")
    ingrediente = relationship("Ingrediente")
    opcao = relationship("ProdutoOpcaoCustomizacao", back_populates="cart_customizacoes")


class Encomenda(Base):
    __tablename__ = 'encomenda'

    id_encomenda = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_cliente = Column(Integer, ForeignKey('cliente.id_cliente'), nullable=False)
    id_admin = Column(Integer, ForeignKey('admin.id_admin'), nullable=True)
    data_encomenda = Column(DateTime, default=datetime.utcnow, nullable=False)
    estado = Column(Enum('pendente', 'confirmada', 'em_preparacao', 'pronta', 'entregue', 'cancelada', 'reembolsada'), default='pendente', nullable=False)
    metodo_pagamento = Column(Enum('cartao', 'mbway', 'balcao'), nullable=False)
    estado_pagamento = Column(Enum('nao_pago', 'pago', 'reembolsado'), default='nao_pago', nullable=False)
    subtotal = Column(Numeric(10, 2), nullable=False, default=0)
    iva_percentual = Column(Numeric(5, 2), nullable=False, default=13)
    iva_valor = Column(Numeric(10, 2), nullable=False, default=0)
    desconto_total = Column(Numeric(10, 2), nullable=False, default=0)
    total = Column(Numeric(10, 2), nullable=False, default=0)
    notas = Column(String(500), nullable=True)
    data_cancelamento = Column(DateTime, nullable=True)
    origem_cancelamento = Column(String(30), nullable=True)
    data_atualizacao = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    cliente = relationship("Cliente", lazy='joined')
    itens = relationship("EncomendaProduto", back_populates="encomenda", cascade="all, delete-orphan", lazy='joined')
    pagamento = relationship("Pagamento", back_populates="encomenda", uselist=False, cascade="all, delete-orphan", lazy='joined')
    # Parent-side 0..N: an order may exist without any refunds.
    reembolsos = relationship("Reembolso", back_populates="encomenda", cascade="all, delete-orphan", lazy='joined')
    fatura = relationship("Fatura", back_populates="encomenda", uselist=False, cascade="all, delete-orphan")


class Fatura(Base):
    __tablename__ = 'fatura'

    id_fatura = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_encomenda = Column(Integer, ForeignKey('encomenda.id_encomenda', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    numero_fatura = Column(String(40), nullable=False, unique=True, index=True)
    nif_cliente = Column(String(20), nullable=True)
    nome_cliente = Column(String(200), nullable=True)
    morada_cliente = Column(String(500), nullable=True)
    subtotal = Column(Numeric(10, 2), nullable=False, default=0)
    iva_percentual = Column(Numeric(5, 2), nullable=False, default=13)
    iva_valor = Column(Numeric(10, 2), nullable=False, default=0)
    total = Column(Numeric(10, 2), nullable=False, default=0)
    data_emissao = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    encomenda = relationship("Encomenda", back_populates="fatura")


class EncomendaProduto(Base):
    __tablename__ = 'encomenda_produto'

    id_encomenda_produto = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_encomenda = Column(Integer, ForeignKey('encomenda.id_encomenda'), nullable=False)
    id_produto = Column(Integer, ForeignKey('produto.id_produto'), nullable=False)
    quantidade = Column(Integer, nullable=False)
    preco_unitario = Column(Numeric(10, 2), nullable=False)
    nome_produto_snapshot = Column(String(150), nullable=False)
    desconto_percentual_snapshot = Column(Numeric(5, 2), nullable=False, default=0)
    iva_percentual_snapshot = Column(Numeric(5, 2), nullable=False, default=13)
    customizacao = Column(String(1000), nullable=True)

    encomenda = relationship("Encomenda", back_populates="itens")
    produto = relationship("Produto", lazy='joined')
    review = relationship("ProdutoReview", back_populates="encomenda_produto", uselist=False)


class ProdutoReview(Base):
    __tablename__ = 'produto_review'
    __table_args__ = (
        UniqueConstraint('id_encomenda_produto', name='uq_review_encomenda_produto'),
        UniqueConstraint('id_cliente', 'id_produto', name='uq_review_cliente_produto'),
    )

    id_review = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_produto = Column(Integer, ForeignKey('produto.id_produto'), nullable=False, index=True)
    id_cliente = Column(Integer, ForeignKey('cliente.id_cliente'), nullable=False, index=True)
    id_encomenda_produto = Column(Integer, ForeignKey('encomenda_produto.id_encomenda_produto'), nullable=True, unique=True)
    rating = Column(Integer, nullable=False, index=True)
    titulo = Column(String(120), nullable=True)
    comentario = Column(String(1000), nullable=True)
    status = Column(Enum('pendente', 'aprovado', 'rejeitado'), default='aprovado', nullable=False, index=True)
    data_criacao = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    data_atualizacao = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    produto = relationship("Produto", back_populates="reviews")
    cliente = relationship("Cliente", back_populates="reviews")
    encomenda_produto = relationship("EncomendaProduto", back_populates="review")
    # Parent-side 0..N: a review may exist without any admin replies.
    replies = relationship("ReviewReply", back_populates="review", cascade="all, delete-orphan", order_by="ReviewReply.created_at")
    # Parent-side 0..N: a review may exist without any reactions.
    reactions = relationship("ReviewReaction", back_populates="review", cascade="all, delete-orphan")

    @property
    def reply(self):
        """Compatibility alias for screens that still display a single latest reply."""
        return self.replies[-1] if self.replies else None


class ReviewReply(Base):
    __tablename__ = 'review_replies'

    id_reply = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_review = Column(Integer, ForeignKey('produto_review.id_review', ondelete='CASCADE'), nullable=False, index=True)
    id_admin = Column(Integer, ForeignKey('admin.id_admin'), nullable=False, index=True)
    texto = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    review = relationship("ProdutoReview", back_populates="replies")
    admin = relationship("Admin")


class ReviewReaction(Base):
    __tablename__ = 'review_reactions'
    __table_args__ = (
        UniqueConstraint('id_review', 'id_admin', name='uq_review_reaction_admin'),
    )

    id_reaction = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_review = Column(Integer, ForeignKey('produto_review.id_review', ondelete='CASCADE'), nullable=False, index=True)
    id_admin = Column(Integer, ForeignKey('admin.id_admin'), nullable=False, index=True)
    tipo = Column(Enum('like', 'heart'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    review = relationship("ProdutoReview", back_populates="reactions")
    admin = relationship("Admin")




class Pagamento(Base):
    __tablename__ = 'pagamento'

    id_pagamento = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_encomenda = Column(Integer, ForeignKey('encomenda.id_encomenda'), nullable=False, unique=True)
    metodo = Column(Enum('cartao', 'mbway', 'balcao'), nullable=False)
    estado = Column(Enum('pendente', 'aprovado', 'rejeitado', 'reembolsado'), default='pendente', nullable=False)
    valor = Column(Numeric(10, 2), nullable=False)
    referencia_transacao = Column(String(100), nullable=True)
    data_pagamento = Column(DateTime, nullable=True)
    confirmado_por_admin_id = Column(Integer, ForeignKey('admin.id_admin'), nullable=True)

    encomenda = relationship("Encomenda", back_populates="pagamento")
    confirmado_por = relationship("Admin")
    # Parent-side 0..N: a payment may exist without any refunds.
    reembolsos = relationship("Reembolso", back_populates="pagamento")


class Reembolso(Base):
    __tablename__ = 'reembolso'

    id_reembolso = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_encomenda = Column(Integer, ForeignKey('encomenda.id_encomenda'), nullable=False, index=True)
    id_pagamento = Column(Integer, ForeignKey('pagamento.id_pagamento'), nullable=True)
    id_admin = Column(Integer, ForeignKey('admin.id_admin'), nullable=False, index=True)
    valor = Column(Numeric(10, 2), nullable=False)
    motivo = Column(String(80), nullable=False)
    notas = Column(Text, nullable=False)
    status = Column(Enum('aprovado'), default='aprovado', nullable=False)
    metodo = Column(String(120), nullable=False, default='Original payment method')
    recibo_numero = Column(String(40), nullable=False, unique=True, index=True)
    data_reembolso = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    encomenda = relationship("Encomenda", back_populates="reembolsos")
    pagamento = relationship("Pagamento", back_populates="reembolsos")
    admin = relationship("Admin")
