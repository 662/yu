CREATE TABLE "categories" (
	"book_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"icon" text NOT NULL,
	"tone" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"is_preset" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categories_book_id_id_pk" PRIMARY KEY("book_id","id"),
	CONSTRAINT "category_kind" CHECK ("categories"."kind" in ('expense','income')),
	CONSTRAINT "category_position" CHECK ("categories"."sort_order" >= 0),
	CONSTRAINT "category_icon" CHECK ("categories"."icon" in ('Utensils','ShoppingBag','TrainFront','House','Coffee','HeartPulse','Package','Ellipsis','Briefcase','Gift','TrendingUp','GraduationCap','PawPrint','Plane')),
	CONSTRAINT "category_tone" CHECK ("categories"."tone" in ('orange','pink','blue','green','purple','olive','neutral'))
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_book_kind_name" ON "categories" USING btree ("book_id","kind","name");
--> statement-breakpoint
-- Keep legacy category identifiers, so existing journal account IDs remain stable.
INSERT INTO categories (book_id,id,name,kind,icon,tone,sort_order,is_preset,archived)
SELECT b.id,p.id,p.name,p.kind,p.icon,p.tone,p.position,true,false
FROM books b CROSS JOIN (VALUES
('food','餐饮','expense','Utensils','orange',0),
('shopping','购物','expense','ShoppingBag','pink',1),
('transport','交通','expense','TrainFront','blue',2),
('home','居住','expense','House','green',3),
('fun','休闲','expense','Coffee','purple',4),
('health','健康','expense','HeartPulse','pink',5),
('daily','日用','expense','Package','olive',6),
('other','其他','expense','Ellipsis','neutral',7),
('工资','工资','income','Briefcase','green',0),
('奖金','奖金','income','Gift','olive',1),
('其他收入','其他收入','income','TrendingUp','blue',2)
) AS p(id,name,kind,icon,tone,position)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Preserve any historical category identifiers beyond the shipped presets.
INSERT INTO categories (book_id,id,name,kind,icon,tone,sort_order,is_preset,archived)
SELECT DISTINCT t.book_id,t.category,t.category,t.kind,'Ellipsis','neutral',99,false,true
FROM transactions t
WHERE t.kind IN ('expense','income')
AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.book_id=t.book_id AND c.id=t.category)
ON CONFLICT DO NOTHING;
