import { AddOnCatalogModel, AddOnView } from "../addOns/domain/addOnCatalog";
import { AddOnViewConnection } from "../addOns/service/AddOnViewHub";

/** A view that keeps every model the catalog posted to it. */
export class RecordingAddOnView {
    readonly models: AddOnCatalogModel[] = [];
    readonly post = (model: AddOnCatalogModel): void => {
        this.models.push(model);
    };

    connection?: AddOnViewConnection;

    attachTo(
        catalog: {
            attachView(
                post: (model: AddOnCatalogModel) => void,
                visible: boolean,
            ): AddOnViewConnection;
        },
        visible = true,
    ): AddOnViewConnection {
        this.connection = catalog.attachView(this.post, visible);
        return this.connection;
    }

    latest(): AddOnCatalogModel {
        const model = this.models[this.models.length - 1];
        if (model === undefined) throw new Error("no model posted");
        return model;
    }

    addOns(): AddOnView[] {
        return this.latest().groups.flatMap(({ sources }) =>
            sources.flatMap(({ addOns }) => addOns),
        );
    }

    addOnNamed(name: string): AddOnView {
        const found = this.addOns().find((addOn) => addOn.name === name);
        if (found === undefined) throw new Error(`no add-on named ${name}`);
        return found;
    }
}
