import React, { useEffect, useState } from 'react';
import { productService } from '../services';
import type { Product } from '../types/product';
import { useTranslation } from 'react-i18next';

type ProductsByCategory = Record<string, Product[]>;

const MenuSection: React.FC = () => {
  const { t } = useTranslation('storefront');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const data = await productService.getPage({ page: 1, perPage: 20, sort: "popular" });
        setProducts(data.items);
      } catch (fetchError) {
        setError(t('menuSection.loadError'));
        console.error(fetchError);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [t]);

  const groupedProducts = products.reduce<ProductsByCategory>((acc, product) => {
    const category = product.category || t('menuSection.uncategorised');
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {});

  return (
    <section className="menu py-5" id="menu">
      {loading && <p className="text-center">{t('menuSection.loading')}</p>}
      {error && <p className="text-center text-danger">{error}</p>}
      {!loading && !error && (
        <div className="menu-columns">
          {Object.entries(groupedProducts).map(([category, items]) => (
            <div key={category} className="menu-column glassy-card title-menu">
              <h2>{category}</h2>

             <div className="custom-border-bottom my-3"></div>

             
            

           
              {items.map((item) => (
                <div key={item.id} className="menu-item">
                  <h3>{item.name}</h3>
                  <p>{item.description ?? t('menuSection.noDescription')}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default MenuSection;
